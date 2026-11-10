import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Store } from "../model/store";
import type { IconKey } from "../model/types";
import { Theme } from "../theme";
import { createGifWriter, makePalette } from "../export/gif";
import { ELEVATION, FRUSTUM_H, HALF, METRICS, PXW, SP, ViewMode, elevationOf, snapAzimuth } from "./constants";
import { EdgeView } from "./edgeView";
import { EdgeSpec, TileSpec, placeLabels } from "./labels";
import { NODE_PICK_HEIGHT, NodeView } from "./nodeView";
import { Rect, labelAnchor, routeAll } from "./routing";
import { Ctx, TextureFactory } from "./textures";
import { TextView } from "./textView";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** Owns the Three.js scene: camera, lights, floor, and one view object per node and edge. */
/** Auto-rotate speed in radians per second (a full turn takes about 42 seconds). */
const AUTO_ROTATE_SPEED = 0.15;

export class SceneView {
  readonly canvas: HTMLCanvasElement;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private ctx: Ctx;
  private nodes = new Map<string, NodeView>();
  private edges = new Map<string, EdgeView>();
  private texts = new Map<string, TextView>();
  private floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private grid: THREE.GridHelper;
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private ghost: NodeView | null = null;
  private rubber: Line2 | null = null;
  private hoverNode: string | null = null;
  private hoverEdge: string | null = null;
  private hoverText: string | null = null;

  private mode: ViewMode = "3d";
  private elev = ELEVATION; // camera tilt above the ground, animated between the two modes
  private elevTarget = ELEVATION;
  private az = Math.PI / 4;
  private azTarget = Math.PI / 4;
  private spin = false; // auto-rotate switched on
  private spinHold = false; // paused while the pointer is down so dragging stays steady
  private spinLabelAz = Math.PI / 4; // the view angle labels are placed for while auto-rotate runs, so they never jump
  private zoom = 1;
  private target = new THREE.Vector3();
  private size = new THREE.Vector2(1, 1);
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private last = performance.now();
  private disposers: (() => void)[] = [];
  private exporting = false;

  constructor(private container: HTMLElement, private store: Store, theme: Theme) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = "block";
    this.canvas.style.touchAction = "none";
    container.prepend(this.canvas);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.ctx = { theme, tex: new TextureFactory(theme) };

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
    this.floor.position.y = -0.002;
    this.grid = new THREE.GridHelper(SP * 90, 90);
    this.grid.position.set(SP / 2, 0.002, SP / 2);
    const gm = this.grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.depthWrite = false;
    this.sun.position.set(-8, 14, 6);
    this.scene.add(this.floor, this.grid, this.hemi, this.sun);

    this.applyThemeColors();
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.disposers.push(() => ro.disconnect());

    const unsub = store.subscribe((kind) => (kind === "doc" ? this.sync() : this.syncSelection()));
    this.disposers.push(unsub);
    this.sync();

    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ----------------------------------------------------------------- theme

  setTheme(theme: Theme): void {
    const old = this.ctx.tex;
    this.ctx = { theme, tex: new TextureFactory(theme) };
    this.applyThemeColors();
    for (const n of this.nodes.values()) n.applyTheme(this.ctx);
    for (const e of this.edges.values()) e.applyTheme(this.ctx);
    for (const t of this.texts.values()) t.applyTheme(this.ctx);
    this.ghost?.applyTheme(this.ctx);
    this.sync();
    old.dispose();
  }

  private applyThemeColors(): void {
    const t = this.ctx.theme;
    this.scene.background = new THREE.Color(t.board);
    this.floor.material.color.set(t.board);
    const gm = this.grid.material as THREE.LineBasicMaterial;
    gm.color.set(t.tile);
    gm.opacity = t.dark ? 0.22 : 0.3;
    this.hemi.color.set("#ffffff");
    this.hemi.groundColor.set(t.dark ? "#59606e" : "#c8ccd4");
    this.hemi.intensity = t.dark ? 1.9 : 2.1;
    this.sun.color.set("#ffffff");
    this.sun.intensity = t.dark ? 1.5 : 1.1;
  }

  // ----------------------------------------------------------------- sizing

  /** Re-measure the container. Call after the canvas is attached to the page, before fit(). */
  resizeNow(): void { this.resize(); }

  private resize(): void {
    if (this.exporting) return; // the export puts the size back when it is done
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.size.set(w, h);
    this.renderer.setSize(w, h);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    const aspect = w / h;
    this.camera.left = (-FRUSTUM_H * aspect) / 2;
    this.camera.right = (FRUSTUM_H * aspect) / 2;
    this.camera.top = FRUSTUM_H / 2;
    this.camera.bottom = -FRUSTUM_H / 2;
    this.updateCamera();
    for (const e of this.edges.values()) e.setResolution(w, h);
    (this.rubber?.material as LineMaterial | undefined)?.resolution.set(w, h);
  }

  private updateCamera(): void {
    const d = 120, e = this.elev;
    this.camera.position.set(
      this.target.x + d * Math.cos(e) * Math.sin(this.az),
      this.target.y + d * Math.sin(e),
      this.target.z + d * Math.cos(e) * Math.cos(this.az),
    );
    this.camera.zoom = this.zoom;
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  // ------------------------------------------------------------ camera API

  get viewMode(): ViewMode { return this.mode; }

  /**
   * Switch between the isometric 3D board (models) and the flat top-down 2D board (original glyphs).
   * The camera tilts smoothly. The flat board is turned to a quarter turn so the grid is axis aligned,
   * and the 3D board to a diagonal one.
   */
  setMode(mode: ViewMode, animate = true): void {
    this.mode = mode;
    this.elevTarget = elevationOf(mode);
    this.azTarget = snapAzimuth(this.azTarget, mode); // never accumulates rotation, see snapAzimuth
    if (!animate) { this.elev = this.elevTarget; this.az = this.azTarget; this.updateCamera(); }
    for (const n of this.nodes.values()) n.setMode(mode);
    this.ghost?.setMode(mode);
    this.sync(); // label placement depends on the mode and the view angle
    this.fit(!animate); // when animating, leave the azimuth and tilt to glide to their targets
  }

  /** Keep turning the 3D board slowly. It only runs in 3D mode, and pauses while the pointer is down. */
  get autoRotate(): boolean { return this.spin; }
  setAutoRotate(on: boolean): void {
    this.spin = on;
    if (on) this.spinLabelAz = this.azTarget; // place labels once, here, and keep them while the board turns
    if (on && this.mode === "3d") this.fitForSpin();
    this.sync(); // re-place for the new mode: frozen angle when starting, the live angle when stopping
  }
  holdRotation(hold: boolean): void { this.spinHold = hold; }

  rotateView(dir: 1 | -1): void {
    this.azTarget += (dir * Math.PI) / 2;
    this.sync(); // label placement depends on the view angle
  }

  zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.groundPoint(clientX, clientY);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.updateCamera();
    const after = this.groundPoint(clientX, clientY);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
      this.updateCamera();
    }
  }

  zoomCentered(factor: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  /** Drag the world so the point under `from` ends up under `to`. */
  panScreen(fromX: number, fromY: number, toX: number, toY: number): void {
    const a = this.groundPoint(fromX, fromY), b = this.groundPoint(toX, toY);
    if (!a || !b) return;
    this.target.x += a.x - b.x;
    this.target.z += a.z - b.z;
    this.updateCamera();
  }

  /** Screen-space extent (right and up, in world units) of everything on the board, seen from azimuth `az`. */
  private boardBounds(az: number, e = this.elevTarget): { minR: number; maxR: number; minU: number; maxU: number } | null {
    const { nodes, texts } = this.store.doc;
    if (nodes.length === 0 && texts.length === 0) return null;
    const r3 = [Math.cos(az), -Math.sin(az)]; // screen-right in the ground plane (x, z)
    const up3 = [-Math.sin(e) * Math.sin(az), Math.cos(e), -Math.sin(e) * Math.cos(az)];
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
    const grow = (r: number, u: number) => {
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    };
    for (const n of nodes) {
      for (const dx of [-HALF, HALF]) for (const dz of [-HALF, HALF]) for (const y of [0, NODE_PICK_HEIGHT]) {
        const x = n.gx * SP + dx, z = n.gy * SP + dz;
        grow(x * r3[0] + z * r3[1], x * up3[0] + y * up3[1] + z * up3[2]);
      }
    }
    // Text boxes are screen-facing, so their extent is a rectangle around their centre in screen space.
    for (const t of texts) {
      const { w, h } = this.ctx.tex.textBox(t.text, t.size, !!t.boxed);
      const x = t.gx * SP, z = t.gy * SP;
      const r = x * r3[0] + z * r3[1], u = x * up3[0] + z * up3[2];
      grow(r - (w * PXW) / 2, u - (h * PXW) / 2);
      grow(r + (w * PXW) / 2, u + (h * PXW) / 2);
    }
    return { minR, maxR, minU: minU - (nodes.length ? 1.4 : 0) /* labels hang under the front row */, maxU };
  }

  /** Move the look-at point on the ground so the centre of the given bounds is at the screen centre. */
  private centreOn(b: { minR: number; maxR: number; minU: number; maxU: number }, az: number, e = this.elevTarget): void {
    const r3 = [Math.cos(az), -Math.sin(az)];
    const upX = -Math.sin(e) * Math.sin(az), upZ = -Math.sin(e) * Math.cos(az);
    const rT = this.target.x * r3[0] + this.target.z * r3[1];
    const uT = this.target.x * upX + this.target.z * upZ;
    const dr = (b.minR + b.maxR) / 2 - rT, du = (b.minU + b.maxU) / 2 - uT;
    const fwd = [-Math.sin(az), -Math.cos(az)];
    this.target.x += r3[0] * dr + (fwd[0] * du) / Math.sin(e);
    this.target.z += r3[1] * dr + (fwd[1] * du) / Math.sin(e);
  }

  /** Middle of everything on the board, on the ground plane. Null when the board is empty. */
  private groundCentre(): { x: number; z: number } | null {
    const { nodes, texts } = this.store.doc;
    if (nodes.length === 0 && texts.length === 0) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const grow = (x: number, z: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    for (const n of nodes) { grow(n.gx * SP - HALF, n.gy * SP - HALF); grow(n.gx * SP + HALF, n.gy * SP + HALF); }
    for (const t of texts) grow(t.gx * SP, t.gy * SP);
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }

  /** How far the board reaches right and up of `centre` on screen, taking the worst case over the view angles. */
  private extentAround(centre: { x: number; z: number }, azimuths: number[], e: number): { hr: number; hu: number } {
    let hr = 0, hu = 0;
    for (const az of azimuths) {
      const b = this.boardBounds(az, e);
      if (!b) continue;
      const rT = centre.x * Math.cos(az) - centre.z * Math.sin(az);
      const uT = -Math.sin(e) * (centre.x * Math.sin(az) + centre.z * Math.cos(az));
      hr = Math.max(hr, b.maxR - rT, rT - b.minR);
      hu = Math.max(hu, b.maxU - uT, uT - b.minU);
    }
    return { hr, hu };
  }

  /**
   * Centre on the middle of the board and zoom so it stays on screen from every angle, for auto-rotate.
   * The board turns about the centre, so the fit is taken over a full turn instead of the current angle.
   */
  private fitForSpin(): void {
    const c = this.groundCentre();
    if (!c) { this.target.set(0, 0, 0); this.updateCamera(); return; }
    this.target.set(c.x, 0, c.z);
    const { hr, hu } = this.extentAround(c, Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2), this.elevTarget);
    const aspect = this.size.x / this.size.y;
    const w = hr * 2 + 4, h = hu * 2 + 4;
    this.zoom = Math.min(2, Math.max(MIN_ZOOM, Math.min((FRUSTUM_H * aspect) / w, FRUSTUM_H / h)));
    this.updateCamera();
  }

  /** Centre and zoom so the whole board is visible. `snapAz` jumps straight to the target azimuth. */
  fit(snapAz = true): void {
    if (this.spin && this.mode === "3d") { this.fitForSpin(); return; }
    const az = this.azTarget;
    const b = this.boardBounds(az);
    if (!b) {
      this.target.set(0, 0, 0);
      this.zoom = 1;
      this.updateCamera();
      return;
    }
    if (snapAz) this.az = az;
    this.centreOn(b, az);
    const aspect = this.size.x / this.size.y;
    const w = b.maxR - b.minR + 4, h = b.maxU - b.minU + 4;
    this.zoom = Math.min(2, Math.max(MIN_ZOOM, Math.min((FRUSTUM_H * aspect) / w, FRUSTUM_H / h)));
    this.updateCamera();
  }

  // ---------------------------------------------------------------- picking

  private ndc(clientX: number, clientY: number): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  /** Point on the ground plane under a screen position. */
  groundPoint(clientX: number, clientY: number): { x: number; z: number } | null {
    this.ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, out) ? { x: out.x, z: out.z } : null;
  }

  pickNode(clientX: number, clientY: number): string | null {
    const p = this.ndc(clientX, clientY);
    let best: string | null = null, bestDepth = -Infinity;
    for (const [id, v] of this.nodes) {
      const d = v.hitTest(this.camera, p.x, p.y);
      if (d !== null && d > bestDepth) { best = id; bestDepth = d; }
    }
    return best;
  }

  pickEdge(clientX: number, clientY: number): string | null {
    const g = this.groundPoint(clientX, clientY);
    if (!g) return null;
    let best: string | null = null, bestD = 0.42 / Math.max(0.6, this.zoom);
    for (const [id, v] of this.edges) {
      const d = v.distanceTo(g.x, g.z);
      if (d < bestD) { best = id; bestD = d; }
    }
    return best;
  }

  /** The text box under the pointer, if any. Text boxes sit on top of everything else. */
  pickText(clientX: number, clientY: number): string | null {
    const p = this.ndc(clientX, clientY);
    let best: string | null = null, bestD = Infinity;
    for (const [id, v] of this.texts) {
      const d = v.hitTest(this.camera, p.x, p.y);
      if (d !== null && d < bestD) { best = id; bestD = d; }
    }
    return best;
  }

  setHover(nodeId: string | null, edgeId: string | null, textId: string | null = null): void {
    if (textId !== this.hoverText) {
      this.texts.get(this.hoverText ?? "")?.setHover(false);
      this.hoverText = textId;
      this.texts.get(textId ?? "")?.setHover(true);
    }
    if (nodeId !== this.hoverNode) {
      this.nodes.get(this.hoverNode ?? "")?.setHover(false);
      this.hoverNode = nodeId;
      this.nodes.get(nodeId ?? "")?.setHover(true);
    }
    if (edgeId !== this.hoverEdge) {
      this.edges.get(this.hoverEdge ?? "")?.setHover(false);
      this.hoverEdge = edgeId;
      this.edges.get(edgeId ?? "")?.setHover(true);
    }
  }

  // ------------------------------------------------------ transient helpers

  showGhost(icon: IconKey | null, gx = 0, gy = 0, valid = true): void {
    if (!icon) {
      if (this.ghost) { this.ghost.dispose(); this.ghost = null; }
      return;
    }
    const data = { id: "ghost", gx, gy, icon, label: "" };
    if (!this.ghost) {
      this.ghost = new NodeView(data, this.ctx);
      this.ghost.setMode(this.mode);
      this.scene.add(this.ghost.group);
    } else this.ghost.setData(data);
    this.ghost.setGhost(0.6, valid);
  }

  /** Dashed line from a tile to the pointer while connecting. Pass null to hide. */
  showRubber(from: { x: number; z: number } | null, to: { x: number; z: number } | null): void {
    if (this.rubber) {
      this.rubber.geometry.dispose();
      (this.rubber.material as LineMaterial).dispose();
      this.rubber.removeFromParent();
      this.rubber = null;
    }
    if (!from || !to) return;
    const geo = new LineGeometry();
    geo.setPositions([from.x, 0.3, from.z, to.x, 0.3, to.z]);
    const mat = new LineMaterial({
      color: new THREE.Color(this.ctx.theme.accent).getHex(),
      linewidth: 2.4, dashed: true, dashSize: 0.25, gapSize: 0.18, worldUnits: false,
    });
    mat.resolution.copy(this.size);
    this.rubber = new Line2(geo, mat);
    this.rubber.computeLineDistances();
    this.rubber.renderOrder = 20;
    this.scene.add(this.rubber);
  }

  // ------------------------------------------------------------------- sync

  private sync(): void {
    const doc = this.store.doc;
    const seen = new Set<string>();
    for (const n of doc.nodes) {
      seen.add(n.id);
      const v = this.nodes.get(n.id);
      if (v) v.setData(n);
      else {
        const nv = new NodeView(n, this.ctx);
        nv.setMode(this.mode);
        this.nodes.set(n.id, nv);
        this.scene.add(nv.group);
      }
    }
    for (const [id, v] of this.nodes) if (!seen.has(id)) { v.dispose(); this.nodes.delete(id); }

    const rects: Rect[] = doc.nodes.map((n) => ({ id: n.id, cx: n.gx * SP, cz: n.gy * SP, hw: HALF, hh: HALF }));
    const routes = routeAll(rects, doc.edges);
    const liveEdges = new Set<string>();
    // Pills and tile names are screen-space sprites, so label placement is done for the current view angle.
    const { tex } = this.ctx;
    const tiles: TileSpec[] = doc.nodes.map((n) => {
      const l = tex.nodeLabel(n.label);
      return { cx: n.gx * SP, cz: n.gy * SP, labelW: l.w * PXW, labelH: l.h * PXW };
    });
    const specs: EdgeSpec[] = [];
    for (const e of doc.edges) {
      const route = routes.get(e.id);
      if (!route) continue;
      const pill = e.label ? tex.pill(e.label, !!e.hot) : null;
      specs.push({ id: e.id, pts: route.pts, pillW: pill ? pill.w * PXW : 0, pillH: pill ? pill.h * PXW : 0, badge: !!e.step });
    }
    const labelAz = this.spin ? this.spinLabelAz : this.azTarget;
    const anchors = placeLabels(labelAz, this.elevTarget, tiles, specs, METRICS[this.mode]);
    for (const e of doc.edges) {
      const route = routes.get(e.id);
      if (!route) continue;
      liveEdges.add(e.id);
      const anchor = anchors.get(e.id) ?? labelAnchor(route.pts);
      let v = this.edges.get(e.id);
      if (!v) {
        v = new EdgeView(e, this.ctx);
        v.setResolution(this.size.x, this.size.y);
        this.edges.set(e.id, v);
        this.scene.add(v.group);
      }
      v.update(e, route, anchor);
    }
    for (const [id, v] of this.edges) if (!liveEdges.has(id)) { v.dispose(); this.edges.delete(id); }
    const liveTexts = new Set<string>();
    for (const t of doc.texts) {
      liveTexts.add(t.id);
      const v = this.texts.get(t.id);
      if (v) v.setData(t);
      else {
        const tv = new TextView(t, this.ctx);
        this.texts.set(t.id, tv);
        this.scene.add(tv.group);
      }
    }
    for (const [id, v] of this.texts) if (!liveTexts.has(id)) { v.dispose(); this.texts.delete(id); }
    this.syncSelection();
  }

  private syncSelection(): void {
    const sel = this.store.selection;
    for (const [id, v] of this.nodes) v.setSelected(sel.has(id));
    for (const [id, v] of this.edges) v.setSelected(sel.has(id));
    for (const [id, v] of this.texts) v.setSelected(sel.has(id));
  }

  // ------------------------------------------------------------------- loop

  private frame(): void {
    if (this.exporting) { this.last = performance.now(); return; } // an export owns the canvas for now
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;

    let moved = false;
    if (this.spin && !this.spinHold && this.mode === "3d") {
      // Advance the target and the live angle together so a Q or E turn still glides on top of the spin.
      const d = AUTO_ROTATE_SPEED * dt;
      this.azTarget += d;
      this.az += d;
      moved = true;
    }
    if (Math.abs(this.azTarget - this.az) > 1e-4) {
      this.az += (this.azTarget - this.az) * Math.min(1, dt * 9);
      if (Math.abs(this.azTarget - this.az) < 2e-3) this.az = this.azTarget;
      moved = true;
    }
    if (Math.abs(this.elevTarget - this.elev) > 1e-4) {
      this.elev += (this.elevTarget - this.elev) * Math.min(1, dt * 7);
      if (Math.abs(this.elevTarget - this.elev) < 2e-3) this.elev = this.elevTarget;
      moved = true;
    }
    if (moved) this.updateCamera();
    for (const n of this.nodes.values()) n.tick(t, dt, this.az);
    this.ghost?.tick(t, dt, this.az);
    for (const e of this.edges.values()) e.tick(t);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render the whole board, cropped to its extent, from the current view angle. Selection chrome and the
   * grid are hidden. Returns a PNG data URL. `pxPerUnit` is image pixels per world unit (about 55 is the
   * on-screen size at zoom 1, so the default is a sharp, roughly 2x image).
   */
  exportPng(pxPerUnit = 110): string {
    const b = this.boardBounds(this.az, this.elev);
    if (!b) throw new Error("There is nothing on the board to export.");
    const margin = 1.6;
    const bw = b.maxR - b.minR + margin * 2, bh = b.maxU - b.minU + margin * 2;
    const k = Math.min(1, 4096 / (bw * pxPerUnit), 4096 / (bh * pxPerUnit));
    const ppu = pxPerUnit * k;
    const W = Math.round(bw * ppu), H = Math.round(bh * ppu);

    const saved = { target: this.target.clone(), zoom: this.zoom, pr: this.renderer.getPixelRatio() };
    const chrome = (v: boolean) => {
      for (const n of this.nodes.values()) n.setChromeVisible(v);
      for (const e of this.edges.values()) e.setChromeVisible(v);
      for (const t of this.texts.values()) t.setChromeVisible(v);
      if (this.ghost) this.ghost.group.visible = v;
      if (this.rubber) this.rubber.visible = v;
      this.grid.visible = v;
    };
    this.exporting = true;
    try {
      chrome(false);
      this.centreOn(b, this.az, this.elev);
      this.zoom = 1;
      this.camera.left = -bw / 2; this.camera.right = bw / 2; this.camera.top = bh / 2; this.camera.bottom = -bh / 2;
      this.updateCamera();
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(W, H, false);
      // Line widths are in pixels; scale the resolution so strokes keep the weight they have on screen.
      const onScreen = (this.size.y / FRUSTUM_H) * saved.zoom;
      const s = ppu / onScreen;
      for (const e of this.edges.values()) e.setResolution(W / s, H / s);
      this.renderer.render(this.scene, this.camera);
      return this.canvas.toDataURL("image/png");
    } finally {
      this.target.copy(saved.target);
      this.zoom = saved.zoom;
      this.renderer.setPixelRatio(saved.pr);
      this.renderer.setSize(this.size.x, this.size.y);
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.exporting = false;
      this.resize();
      chrome(true);
    }
  }

  /**
   * Render an animated GIF of the board. With auto-rotate on in 3D the camera makes one full turn around it;
   * otherwise the view stays still and only the flowing dots and the models' idle motion move. The framing fits the board from every angle, selection
   * chrome and the grid are hidden, and the canvas is handed back exactly as it was.
   */
  async exportGif(opts: { stillSeconds: number; stillFps: number; turnFps: number; width: number; onProgress?: (done: number, total: number) => void }): Promise<Blob> {
    const centre = this.groundCentre();
    if (!centre) throw new Error("There is nothing on the board to export.");
    const turn = this.mode === "3d" && this.spin; // the board only turns when Auto is on
    // A turn lasts as long as it does on screen with Auto on, so the GIF rotates at the same calm pace.
    const fps = turn ? opts.turnFps : opts.stillFps;
    const seconds = turn ? (Math.PI * 2) / AUTO_ROTATE_SPEED : opts.stillSeconds;
    const total = Math.max(2, Math.round(seconds * fps));
    const e = this.elev;
    const base = this.az;
    const azimuths = Array.from({ length: total }, (_, i) => base + (turn ? (i / total) * Math.PI * 2 : 0));
    const { hr, hu } = this.extentAround(centre, azimuths, e);
    const margin = 1.3;
    const bw = hr * 2 + margin * 2, bh = hu * 2 + margin * 2;
    const W = Math.round(opts.width), H = Math.max(2, Math.round((W * bh) / bw));

    const saved = { target: this.target.clone(), zoom: this.zoom, az: this.az, pr: this.renderer.getPixelRatio() };
    const chrome = (v: boolean) => {
      for (const n of this.nodes.values()) n.setChromeVisible(v);
      for (const ed of this.edges.values()) ed.setChromeVisible(v);
      for (const t of this.texts.values()) t.setChromeVisible(v);
      if (this.ghost) this.ghost.group.visible = v;
      if (this.rubber) this.rubber.visible = v;
      this.grid.visible = v;
    };
    this.exporting = true;
    try {
      chrome(false);
      this.target.set(centre.x, 0, centre.z);
      this.zoom = 1;
      this.camera.left = -bw / 2; this.camera.right = bw / 2; this.camera.top = bh / 2; this.camera.bottom = -bh / 2;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(W, H, false);
      const onScreen = (this.size.y / FRUSTUM_H) * saved.zoom;
      const s = W / bw / onScreen; // keep stroke weights the same as on screen
      for (const ed of this.edges.values()) ed.setResolution(W / s, H / s);

      const copy = document.createElement("canvas");
      copy.width = W; copy.height = H;
      const c2 = copy.getContext("2d", { willReadFrequently: true });
      if (!c2) throw new Error("This browser cannot read the canvas, so a GIF cannot be made.");
      const capture = (i: number): Uint8ClampedArray => {
        const t = i / fps;
        this.az = azimuths[i];
        this.updateCamera();
        for (const n of this.nodes.values()) n.tick(t, 1 / fps, this.az);
        for (const ed of this.edges.values()) ed.tick(t);
        this.renderer.render(this.scene, this.camera);
        c2.drawImage(this.canvas, 0, 0); // straight after render, while the frame is still in the buffer
        return c2.getImageData(0, 0, W, H).data;
      };
      // One shared palette from six frames spread through the clip (so colours do not shift or flicker),
      // then every frame is packed into the file straight after it is rendered.
      const picks = [0, 1, 2, 3, 4, 5].map((k) => Math.floor((k * total) / 6));
      const palette = makePalette(picks.map(capture));
      const writer = createGifWriter(palette, W, H, fps);
      for (let i = 0; i < total; i++) {
        writer.add(capture(i));
        opts.onProgress?.(i + 1, total);
        if (i % 2 === 1) await new Promise<void>((r) => setTimeout(r, 0)); // let the progress message paint
      }
      const bytes = writer.finish();
      return new Blob([bytes as BlobPart], { type: "image/gif" });
    } finally {
      this.target.copy(saved.target);
      this.zoom = saved.zoom;
      this.az = saved.az;
      this.renderer.setPixelRatio(saved.pr);
      this.renderer.setSize(this.size.x, this.size.y);
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.exporting = false;
      this.resize();
      chrome(true);
    }
  }

  get isExporting(): boolean { return this.exporting; }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.disposers.forEach((d) => d());
    for (const n of this.nodes.values()) n.dispose();
    for (const e of this.edges.values()) e.dispose();
    for (const t of this.texts.values()) t.dispose();
    this.ctx.tex.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
