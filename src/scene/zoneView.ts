import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ZoneData } from "../model/types";
import { PXW, SP } from "./constants";
import type { Ctx } from "./textures";

const FLOOR_Y = 0.004;
const OUTLINE_Y = 0.006;
const HANDLE = 0.34; // world units
/** How close to the outline (in cells) a click counts as picking the zone. */
export const ZONE_PICK_BAND = 0.3;

/** Corner index: bit 0 is the right side, bit 1 is the far (larger row) side. */
export type Corner = 0 | 1 | 2 | 3;

/** Rounded rectangle outline as points on the XZ plane. */
function roundedPoints(x0: number, z0: number, x1: number, z1: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  const arc = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  };
  arc(x1 - r, z0 + r, -Math.PI / 2);
  arc(x1 - r, z1 - r, 0);
  arc(x0 + r, z1 - r, Math.PI / 2);
  arc(x0 + r, z0 + r, Math.PI);
  return pts;
}

/**
 * One zone: a tinted, rounded area lying on the floor under tiles and arrows, with a screen facing name at
 * its back corner. It is the same flat mesh in 2D and 3D. Selected zones show four corner handles.
 */
export class ZoneView {
  readonly group = new THREE.Group();
  data: ZoneData;

  private ctx: Ctx;
  private key = "";
  private fill: THREE.Mesh | null = null;
  private line: Line2 | null = null;
  private label: THREE.Sprite | null = null;
  private labelSize = { w: 0, h: 0 };
  private handles: THREE.Mesh[] = [];
  private selected = false;
  private hover = false;
  private chrome = true;
  private order = 1;
  private resolution = new THREE.Vector2(1, 1);

  constructor(data: ZoneData, ctx: Ctx) {
    this.data = data;
    this.ctx = ctx;
    this.rebuild();
  }

  setResolution(w: number, h: number): void {
    this.resolution.set(w, h);
    if (this.line) (this.line.material as LineMaterial).resolution.set(w, h);
  }

  applyTheme(ctx: Ctx): void { this.ctx = ctx; this.key = ""; this.rebuild(); }

  setData(data: ZoneData): void {
    this.data = data;
    const key = JSON.stringify([data.gx, data.gy, data.w, data.h, data.label, data.color]);
    if (key === this.key) return;
    this.rebuild();
  }

  /** Draw order among zones: bigger zones first, so smaller ones sit on top of them. */
  setOrder(n: number): void {
    this.order = 1 + n * 0.5;
    if (this.fill) this.fill.renderOrder = this.order;
    if (this.line) this.line.renderOrder = this.order + 0.25;
  }

  private clear(): void {
    if (this.fill) { this.fill.geometry.dispose(); (this.fill.material as THREE.Material).dispose(); this.fill.removeFromParent(); this.fill = null; }
    if (this.line) { this.line.geometry.dispose(); (this.line.material as LineMaterial).dispose(); this.line.removeFromParent(); this.line = null; }
    if (this.label) { this.label.material.dispose(); this.label.removeFromParent(); this.label = null; }
    for (const h of this.handles) { h.geometry.dispose(); (h.material as THREE.Material).dispose(); h.removeFromParent(); }
    this.handles = [];
  }

  private rebuild(): void {
    this.clear();
    const d = this.data;
    this.key = JSON.stringify([d.gx, d.gy, d.w, d.h, d.label, d.color]);
    const x0 = d.gx * SP, z0 = d.gy * SP, x1 = (d.gx + d.w) * SP, z1 = (d.gy + d.h) * SP;
    const r = Math.min(0.9, (x1 - x0) / 4, (z1 - z0) / 4);
    const pts = roundedPoints(x0, z0, x1, z1, r);
    const dark = this.ctx.theme.dark;

    // The shape is drawn in (x, -z) so that rotating it flat puts it on the ground facing up.
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: dark ? 0.2 : 0.17, depthWrite: false }));
    this.fill.position.y = FLOOR_Y;
    this.group.add(this.fill);

    const lg = new LineGeometry();
    lg.setPositions([...pts, pts[0]].flatMap(([x, z]) => [x, OUTLINE_Y, z]));
    const lm = new LineMaterial({ color: new THREE.Color(d.color).getHex(), linewidth: 1.6, transparent: true, opacity: 0.75, worldUnits: false });
    lm.resolution.copy(this.resolution);
    this.line = new Line2(lg, lm);
    this.group.add(this.line);

    if (d.label.trim()) {
      const info = this.ctx.tex.zoneLabel(d.label, this.labelColor(d.color));
      this.labelSize = { w: info.w, h: info.h };
      this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: info.tex, transparent: true, depthTest: false, depthWrite: false }));
      this.label.scale.set(info.w * PXW, info.h * PXW, 1);
      this.label.center.set(0, 1); // the top left of the name sits at the anchor
      this.label.position.set(x0 + 0.35, 0.02, z0 + 0.35);
      this.label.renderOrder = 6;
      this.group.add(this.label);
    } else this.labelSize = { w: 0, h: 0 };

    const hm = new THREE.MeshBasicMaterial({ color: this.ctx.theme.accent, depthTest: false, transparent: true });
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) {
      const hmesh = new THREE.Mesh(new THREE.BoxGeometry(HANDLE, 0.06, HANDLE), hm.clone());
      hmesh.position.set(x, 0.05, z);
      hmesh.renderOrder = 12;
      this.handles.push(hmesh);
      this.group.add(hmesh);
    }
    hm.dispose();
    this.setOrder((this.order - 1) / 0.5);
    this.applyState();
  }

  /** Zone colours are mid tones. Nudge the name lighter on dark boards and darker on light ones so it reads. */
  private labelColor(hex: string): string {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s), this.ctx.theme.dark ? Math.max(hsl.l, 0.68) : Math.min(hsl.l, 0.34));
    return "#" + c.getHexString();
  }

  setSelected(v: boolean): void { this.selected = v; this.applyState(); }
  setHover(v: boolean): void { this.hover = v; this.applyState(); }
  setChromeVisible(v: boolean): void { this.chrome = v; this.applyState(); }

  private applyState(): void {
    if (!this.line) return;
    const lm = this.line.material as LineMaterial;
    const lit = this.chrome && (this.selected || this.hover);
    lm.color.set(lit && this.selected ? this.ctx.theme.accent : this.data.color);
    lm.linewidth = lit ? (this.selected ? 3 : 2.4) : 1.6;
    lm.opacity = lit ? 1 : 0.75;
    for (const h of this.handles) h.visible = this.chrome && this.selected;
  }

  /** Distance from a ground point to the outline, in world units. Negative inside, positive outside. */
  private signedDistance(x: number, z: number): { outside: number; toEdge: number } {
    const d = this.data;
    const x0 = d.gx * SP, z0 = d.gy * SP, x1 = (d.gx + d.w) * SP, z1 = (d.gy + d.h) * SP;
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
    const outside = Math.hypot(dx, dz);
    const toEdge = outside > 0 ? outside : Math.min(x - x0, x1 - x, z - z0, z1 - z);
    return { outside, toEdge };
  }

  /** Is the ground point on the zone's outline band? */
  hitBand(x: number, z: number): boolean {
    return this.signedDistance(x, z).toEdge <= ZONE_PICK_BAND * SP;
  }

  /** Is the pointer (normalised device coordinates) on the zone's name? */
  hitLabel(camera: THREE.OrthographicCamera, ndcX: number, ndcY: number): boolean {
    if (!this.label || !this.labelSize.w) return false;
    const c = this.label.position.clone().project(camera);
    const fw = (camera.right - camera.left) / camera.zoom, fh = (camera.top - camera.bottom) / camera.zoom;
    const w = (2 * this.labelSize.w * PXW) / fw, h = (2 * this.labelSize.h * PXW) / fh;
    return ndcX >= c.x && ndcX <= c.x + w && ndcY <= c.y && ndcY >= c.y - h;
  }

  /** Which corner handle is under a ground point, if any. Only meaningful for a selected zone. */
  hitCorner(x: number, z: number, reach = 0.4 * SP): Corner | null {
    const d = this.data;
    const xs = [d.gx * SP, (d.gx + d.w) * SP], zs = [d.gy * SP, (d.gy + d.h) * SP];
    let best: Corner | null = null, bestD = reach;
    for (let i = 0; i < 4; i++) {
      const dist = Math.hypot(x - xs[i & 1], z - zs[i >> 1]);
      if (dist < bestD) { best = i as Corner; bestD = dist; }
    }
    return best;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
