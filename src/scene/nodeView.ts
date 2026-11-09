import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { NodeData } from "../model/types";
import { HALF, LABEL_DROP, PXW, SLAB_H, SP, TILE } from "./constants";
import type { Ctx } from "./textures";

const slabGeo = new RoundedBoxGeometry(TILE, SLAB_H, TILE, 3, 0.14);
slabGeo.translate(0, SLAB_H / 2, 0);
const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Invisible box that covers the tile and the standing glyph, used for picking. */
export const NODE_PICK_HEIGHT = 1.9;

const ICON_SIZE = 1.5;

/** One component: a raised tile with a dotted outline, a standing glyph and a label underneath. */
export class NodeView {
  readonly group = new THREE.Group();
  data: NodeData;

  private body = new THREE.Group();
  private slab: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  private top: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private icon: THREE.Sprite;
  private label: THREE.Sprite;
  private ctx: Ctx;

  private selected = false;
  private hover = false;
  private lift = 0;
  private phase = Math.random() * Math.PI * 2;
  private labelKey = "";
  private iconKey = "";

  constructor(data: NodeData, ctx: Ctx) {
    this.data = data;
    this.ctx = ctx;

    this.shadow = new THREE.Mesh(flatGeo.clone(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.shadow.scale.set(TILE * 1.9, 1, TILE * 1.9);
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;

    this.ring = new THREE.Mesh(flatGeo.clone(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.ring.scale.set(TILE * 1.32, 1, TILE * 1.32);
    this.ring.position.y = 0.02;
    this.ring.renderOrder = 2;
    this.ring.visible = false;

    this.slab = new THREE.Mesh(slabGeo, new THREE.MeshLambertMaterial());
    this.top = new THREE.Mesh(flatGeo.clone(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.top.scale.set(TILE * 0.94, 1, TILE * 0.94);
    this.top.position.y = SLAB_H + 0.004;

    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.02 }));
    this.icon.center.set(0.5, 0.18);
    this.icon.scale.set(ICON_SIZE, ICON_SIZE, 1);
    this.icon.position.y = SLAB_H + 0.02;
    this.icon.renderOrder = 5;

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    this.label.renderOrder = 6;

    this.body.add(this.slab, this.top, this.icon);
    this.group.add(this.shadow, this.ring, this.body, this.label);
    this.applyTheme(ctx);
    this.setData(data);
  }

  /** (Re)apply colours and textures after a theme change. */
  applyTheme(ctx: Ctx): void {
    this.ctx = ctx;
    const { theme, tex } = ctx;
    const slabColor = new THREE.Color(theme.board).lerp(new THREE.Color(theme.tile), theme.dark ? 0.34 : 0.2);
    this.slab.material.color.copy(slabColor);
    this.top.material.map = tex.tileTop().tex;
    this.top.material.needsUpdate = true;
    this.shadow.material.map = tex.shadow().tex;
    this.shadow.material.opacity = theme.dark ? 0.9 : 0.5;
    this.shadow.material.needsUpdate = true;
    this.ring.material.map = tex.ring().tex;
    this.ring.material.needsUpdate = true;
    this.labelKey = "";
    this.iconKey = "";
    this.refreshTextures();
  }

  setData(data: NodeData): void {
    this.data = data;
    this.group.position.set(data.gx * SP, 0, data.gy * SP);
    this.refreshTextures();
  }

  private refreshTextures(): void {
    const { tex } = this.ctx;
    if (this.iconKey !== this.data.icon) {
      this.iconKey = this.data.icon;
      this.icon.material.map = tex.icon(this.data.icon).tex;
      this.icon.material.needsUpdate = true;
    }
    const lk = this.data.label;
    if (this.labelKey !== lk) {
      this.labelKey = lk;
      const info = tex.nodeLabel(lk);
      this.label.material.map = info.tex;
      this.label.material.needsUpdate = true;
      const h = info.h * PXW;
      this.label.scale.set(info.w * PXW, h, 1);
      this.label.center.set(0.5, 1 + LABEL_DROP / h);
    }
  }

  setSelected(v: boolean): void { this.selected = v; this.ring.visible = v; }
  setHover(v: boolean): void { this.hover = v; }
  /** Hide selection chrome (for PNG export). */
  setChromeVisible(v: boolean): void { this.ring.visible = v && this.selected; }

  setGhost(opacity: number, valid: boolean): void {
    const mats = [this.slab.material, this.top.material, this.icon.material, this.label.material, this.shadow.material];
    for (const m of mats) { m.transparent = true; m.opacity = opacity; }
    this.slab.material.color.set(valid ? this.ctx.theme.tile : "#e05a47");
    this.ring.visible = false;
  }

  tick(t: number, dt: number): void {
    const target = this.hover || this.selected ? 1 : 0;
    this.lift += (target - this.lift) * Math.min(1, dt * 12);
    this.body.position.y = this.lift * 0.08;
    // Gentle idle bob for the standing glyph: it is what makes the board feel alive.
    this.icon.position.y = SLAB_H + 0.02 + Math.sin(t * 1.6 + this.phase) * 0.018 + this.lift * 0.03;
    if (this.ring.visible) this.ring.material.opacity = 0.7 + Math.sin(t * 3) * 0.3;
  }

  /** Project the pick box to screen and test a pointer position. Returns camera-space depth or null. */
  hitTest(camera: THREE.Camera, ndcX: number, ndcY: number): number | null {
    const p = this.group.position;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, depth = 0;
    const v = new THREE.Vector3();
    for (const dx of [-HALF, HALF]) for (const dz of [-HALF, HALF]) for (const y of [0, NODE_PICK_HEIGHT]) {
      v.set(p.x + dx, y, p.z + dz).project(camera);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    v.set(p.x, 0, p.z).applyMatrix4(camera.matrixWorldInverse);
    depth = v.z; // larger z = closer to the camera
    return ndcX >= minX && ndcX <= maxX && ndcY >= minY && ndcY <= maxY ? depth : null;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.shadow.geometry.dispose();
    this.ring.geometry.dispose();
    this.top.geometry.dispose();
    for (const m of [this.slab.material, this.top.material, this.shadow.material, this.ring.material, this.icon.material, this.label.material]) m.dispose();
  }
}
