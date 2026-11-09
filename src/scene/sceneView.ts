import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Store } from "../model/store";
import type { IconKey } from "../model/types";
import { Theme } from "../theme";
import { ELEVATION, FRUSTUM_H, HALF, PXW, SP } from "./constants";
import { EdgeView } from "./edgeView";
import { EdgeSpec, TileSpec, placeLabels } from "./labels";
import { NODE_PICK_HEIGHT, NodeView } from "./nodeView";
import { Rect, labelAnchor, routeAll } from "./routing";
import { Ctx, TextureFactory } from "./textures";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** Owns the Three.js scene: camera, lights, floor, and one view object per node and edge. */
export class SceneView {
  readonly canvas: HTMLCanvasElement;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private ctx: Ctx;
  private nodes = new Map<string, NodeView>();
  private edges = new Map<string, EdgeView>();
  private floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private grid: THREE.GridHelper;
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private ghost: NodeView | null = null;
  private rubber: Line2 | null = null;
  private hoverNode: string | null = null;
  private hoverEdge: string | null = null;

  private az = Math.PI / 4;
  private azTarget = Math.PI / 4;
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
    this.ctx.tex.onLoad = () => { /* the loop renders every frame; nothing else to do */ };

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
    const d = 120, e = ELEVATION;
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
  private boardBounds(az: number): { minR: number; maxR: number; minU: number; maxU: number } | null {
    const nodes = this.store.doc.nodes;
    if (nodes.length === 0) return null;
    const e = ELEVATION;
    const r3 = [Math.cos(az), -Math.sin(az)]; // screen-right in the ground plane (x, z)
    const up3 = [-Math.sin(e) * Math.sin(az), Math.cos(e), -Math.sin(e) * Math.cos(az)];
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
    for (const n of nodes) {
      for (const dx of [-HALF, HALF]) for (const dz of [-HALF, HALF]) for (const y of [0, NODE_PICK_HEIGHT]) {
        const x = n.gx * SP + dx, z = n.gy * SP + dz;
        const r = x * r3[0] + z * r3[1];
        const u = x * up3[0] + y * up3[1] + z * up3[2];
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      }
    }
    return { minR, maxR, minU: minU - 1.4 /* labels hang under the front row */, maxU };
  }

  /** Move the look-at point on the ground so the centre of the given bounds is at the screen centre. */
  private centreOn(b: { minR: number; maxR: number; minU: number; maxU: number }, az: number): void {
    const e = ELEVATION;
    const r3 = [Math.cos(az), -Math.sin(az)];
    const upX = -Math.sin(e) * Math.sin(az), upZ = -Math.sin(e) * Math.cos(az);
    const rT = this.target.x * r3[0] + this.target.z * r3[1];
    const uT = this.target.x * upX + this.target.z * upZ;
    const dr = (b.minR + b.maxR) / 2 - rT, du = (b.minU + b.maxU) / 2 - uT;
    const fwd = [-Math.sin(az), -Math.cos(az)];
    this.target.x += r3[0] * dr + (fwd[0] * du) / Math.sin(e);
    this.target.z += r3[1] * dr + (fwd[1] * du) / Math.sin(e);
  }

  /** Centre and zoom so the whole board is visible. */
  fit(): void {
    const az = this.azTarget;
    const b = this.boardBounds(az);
    if (!b) {
      this.target.set(0, 0, 0);
      this.zoom = 1;
      this.updateCamera();
      return;
    }
    this.az = az;
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

  setHover(nodeId: string | null, edgeId: string | null): void {
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
    const anchors = placeLabels(this.azTarget, ELEVATION, tiles, specs);
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
    this.syncSelection();
  }

  private syncSelection(): void {
    const sel = this.store.selection;
    for (const [id, v] of this.nodes) v.setSelected(sel.has(id));
    for (const [id, v] of this.edges) v.setSelected(sel.has(id));
  }

  // ------------------------------------------------------------------- loop

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;

    if (Math.abs(this.azTarget - this.az) > 1e-4) {
      this.az += (this.azTarget - this.az) * Math.min(1, dt * 9);
      if (Math.abs(this.azTarget - this.az) < 2e-3) this.az = this.azTarget;
      this.updateCamera();
    }
    for (const n of this.nodes.values()) n.tick(t, dt);
    this.ghost?.tick(t, dt);
    for (const e of this.edges.values()) e.tick(t);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render the whole board, cropped to its extent, from the current view angle. Selection chrome and the
   * grid are hidden. Returns a PNG data URL. `pxPerUnit` is image pixels per world unit (about 55 is the
   * on-screen size at zoom 1, so the default is a sharp, roughly 2x image).
   */
  exportPng(pxPerUnit = 110): string {
    const b = this.boardBounds(this.az);
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
      if (this.ghost) this.ghost.group.visible = v;
      if (this.rubber) this.rubber.visible = v;
      this.grid.visible = v;
    };
    this.exporting = true;
    try {
      chrome(false);
      this.centreOn(b, this.az);
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
      this.resize();
      chrome(true);
      this.exporting = false;
    }
  }

  get isExporting(): boolean { return this.exporting; }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.disposers.forEach((d) => d());
    for (const n of this.nodes.values()) n.dispose();
    for (const e of this.edges.values()) e.dispose();
    this.ctx.tex.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
