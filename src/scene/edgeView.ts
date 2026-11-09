import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { EdgeData } from "../model/types";
import { EDGE_Y, PXW } from "./constants";
import { LabelAnchor, Polyline, Route, V, distanceTo, makePolyline, pointAt, roundPath } from "./routing";
import type { Ctx } from "./textures";

const dotGeo = new THREE.SphereGeometry(0.075, 12, 8);
const FLOW_SPEED = 1.35; // world units per second
const FLOW_SPACING = 1.5;

/** One arrow: a right-angle fat line with an arrow head, optional label pill, step badge and flowing dots. */
export class EdgeView {
  readonly group = new THREE.Group();
  data: EdgeData;
  route: Route | null = null;

  private anchor: LabelAnchor | null = null;
  private ctx: Ctx;
  private key = "";
  private selected = false;
  private hover = false;
  private line: Line2 | null = null;
  private glow: Line2 | null = null;
  private arrow: THREE.Mesh | null = null;
  private pill: THREE.Sprite | null = null;
  private badge: THREE.Sprite | null = null;
  private dots: THREE.Mesh[] = [];
  private dotMat = new THREE.MeshBasicMaterial();
  private arrowMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private path: Polyline = makePolyline([[0, 0]]);
  private corners: V[] = [];
  private resolution = new THREE.Vector2(1, 1);

  constructor(data: EdgeData, ctx: Ctx) {
    this.data = data;
    this.ctx = ctx;
  }

  setResolution(w: number, h: number): void {
    this.resolution.set(w, h);
    for (const l of [this.line, this.glow]) if (l) (l.material as LineMaterial).resolution.set(w, h);
  }

  applyTheme(ctx: Ctx): void {
    this.ctx = ctx;
    this.key = ""; // force a rebuild with the new colours and textures
  }

  /** Update from the document. Rebuilds geometry only when something visible changed. */
  update(data: EdgeData, route: Route, anchor: LabelAnchor): void {
    this.data = data;
    this.route = route;
    this.anchor = anchor;
    const key = JSON.stringify([route.pts, anchor.at, data.label ?? "", data.step ?? 0, !!data.hot, !!data.dash]);
    if (key === this.key) return;
    this.key = key;
    this.rebuild();
  }

  private colorHex(): string {
    return this.data.hot ? this.ctx.theme.accent : this.ctx.theme.wire;
  }

  private clear(): void {
    for (const o of [this.line, this.glow]) {
      if (o) { o.geometry.dispose(); (o.material as LineMaterial).dispose(); o.removeFromParent(); }
    }
    this.line = this.glow = null;
    if (this.arrow) { this.arrow.geometry.dispose(); this.arrow.removeFromParent(); this.arrow = null; }
    for (const s of [this.pill, this.badge]) if (s) { s.material.dispose(); s.removeFromParent(); }
    this.pill = this.badge = null;
    for (const d of this.dots) d.removeFromParent();
    this.dots = [];
  }

  private rebuild(): void {
    this.clear();
    if (!this.route) return;
    const { theme, tex } = this.ctx;
    const corners = this.route.pts;
    this.corners = corners;
    const smooth = roundPath(corners);
    this.path = makePolyline(smooth);

    // Stop the line a little short of the tip so the arrow head sits on the end cleanly.
    const lineLen = Math.max(0, this.path.len - 0.16);
    const lineStrip: V[] = [];
    for (let i = 0; i < smooth.length; i++) if (this.path.cum[i] < lineLen) lineStrip.push(smooth[i]);
    lineStrip.push(pointAt(this.path, lineLen));
    const positions = lineStrip.flatMap(([x, z]) => [x, EDGE_Y, z]);

    const mk = (width: number, color: string, opacity: number, dashed: boolean): Line2 => {
      const geo = new LineGeometry();
      geo.setPositions(positions);
      const mat = new LineMaterial({
        color: new THREE.Color(color).getHex(),
        linewidth: width,
        transparent: opacity < 1,
        opacity,
        dashed,
        dashSize: 0.3,
        gapSize: 0.22,
        worldUnits: false,
      });
      mat.resolution.copy(this.resolution);
      const l = new Line2(geo, mat);
      if (dashed) l.computeLineDistances();
      l.renderOrder = 3;
      return l;
    };

    this.glow = mk(11, theme.step, 0.35, false);
    this.glow.visible = false;
    this.line = mk(this.data.hot ? 3.2 : 2.2, this.colorHex(), 1, !!this.data.dash);
    this.group.add(this.glow, this.line);

    // arrow head
    const n = this.path.pts.length;
    const tip = this.path.pts[n - 1], prev = pointAt(this.path, Math.max(0, this.path.len - 0.3));
    let dx = tip[0] - prev[0], dz = tip[1] - prev[1];
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    const L = 0.3, W = 0.15;
    const bx = tip[0] - dx * L, bz = tip[1] - dz * L;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([
      tip[0], EDGE_Y + 0.004, tip[1],
      bx - dz * W, EDGE_Y + 0.004, bz + dx * W,
      bx + dz * W, EDGE_Y + 0.004, bz - dx * W,
    ], 3));
    this.arrow = new THREE.Mesh(geo, this.arrowMat);
    this.arrow.renderOrder = 4;
    this.group.add(this.arrow);

    // label pill + step badge on the longest segment
    const anchor = this.anchor ?? { at: corners[0], horizontal: true, segLen: 0 };
    const pos = new THREE.Vector3(anchor.at[0], EDGE_Y + 0.01, anchor.at[1]);
    let pillW = 0, pillH = 0;
    if (this.data.label) {
      const info = tex.pill(this.data.label, !!this.data.hot);
      pillW = info.w; pillH = info.h;
      this.pill = new THREE.Sprite(new THREE.SpriteMaterial({ map: info.tex, transparent: true, depthTest: false, depthWrite: false }));
      this.pill.scale.set(info.w * PXW, info.h * PXW, 1);
      this.pill.position.copy(pos);
      this.pill.renderOrder = 8;
      this.group.add(this.pill);
    }
    if (this.data.step) {
      const info = tex.badge(this.data.step);
      this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: info.tex, transparent: true, depthTest: false, depthWrite: false }));
      this.badge.scale.set(info.w * PXW, info.h * PXW, 1);
      this.badge.position.copy(pos);
      // With a label the badge sits to its left (or above it on vertical runs), like the board style.
      if (this.pill) {
        if (anchor.horizontal) this.badge.center.set(0.5 + (pillW / 2 + 15) / info.w, 0.5);
        else this.badge.center.set(0.5, 0.5 - (pillH / 2 + 15) / info.h);
      }
      this.badge.renderOrder = 9;
      this.group.add(this.badge);
    }

    // flowing dots
    const count = Math.max(1, Math.floor(this.path.len / FLOW_SPACING));
    this.dotMat.color.set(this.colorHex());
    this.arrowMat.color.set(this.colorHex());
    for (let i = 0; i < count; i++) {
      const d = new THREE.Mesh(dotGeo, this.dotMat);
      d.renderOrder = 4;
      this.dots.push(d);
      this.group.add(d);
    }
    this.applyState();
  }

  setSelected(v: boolean): void { this.selected = v; this.applyState(); }
  setHover(v: boolean): void { this.hover = v; this.applyState(); }

  private applyState(): void {
    if (!this.line || !this.glow) return;
    this.glow.visible = this.selected || this.hover;
    (this.glow.material as LineMaterial).opacity = this.selected ? 0.5 : 0.25;
    (this.line.material as LineMaterial).linewidth = (this.data.hot ? 3.2 : 2.2) + (this.selected ? 1.2 : 0);
  }

  setChromeVisible(v: boolean): void {
    if (this.glow) this.glow.visible = v && (this.selected || this.hover);
  }

  tick(t: number): void {
    const len = this.path.len;
    if (len <= 0) return;
    const n = this.dots.length;
    const spacing = len / n;
    const off = (t * FLOW_SPEED) % spacing;
    for (let i = 0; i < n; i++) {
      const d = Math.min(len - 0.2, off + i * spacing);
      const p = pointAt(this.path, d);
      // fade dots in near the start and out near the arrow head
      this.dots[i].position.set(p[0], EDGE_Y + 0.05, p[1]);
      const edge = Math.min(d, len - d);
      this.dots[i].scale.setScalar(Math.max(0.01, Math.min(1, edge / 0.5)));
    }
  }

  distanceTo(x: number, z: number): number {
    return this.corners.length ? distanceTo(this.corners, [x, z]) : Infinity;
  }

  dispose(): void {
    this.clear();
    this.dotMat.dispose();
    this.arrowMat.dispose();
    this.group.removeFromParent();
  }
}
