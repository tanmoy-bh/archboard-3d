import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Glyph3D, createGlyph, disposeGlyph } from "../glyphs/models";
import type { NodeData } from "../model/types";
import { HALF, METRICS, PXW, SLAB_H, SP, TILE, ViewMode } from "./constants";
import type { Ctx } from "./textures";

const slabGeo = new RoundedBoxGeometry(TILE, SLAB_H, TILE, 3, 0.14);
slabGeo.translate(0, SLAB_H / 2, 0);
const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Invisible box that covers the tile and the standing model, used for picking. */
export const NODE_PICK_HEIGHT = 1.9;

/** Scale a ghost (placement preview) by changing material opacity, remembering the real opacity. */
function setOpacity(root: THREE.Object3D, k: number): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      const base = (mat.userData.baseOpacity ??= mat.opacity) as number;
      mat.opacity = base * k;
      mat.transparent = k < 1 || base < 1;
    }
  });
}

/** Size of the flat glyph in 2D mode, in world units (the tile is 1.5 wide). */
const FLAT_SIZE = 1.12;

/**
 * One component: a raised tile with a dotted outline, a name underneath, and either a real 3D model
 * standing on it (3D mode) or the flat glyph lying inside it (2D mode).
 */
export class NodeView {
  readonly group = new THREE.Group();
  data: NodeData;

  private body = new THREE.Group();
  private stand = new THREE.Group(); // sits on top of the slab and carries the model
  private slab: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  private top: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private label: THREE.Sprite;
  private flat: THREE.Sprite; // the 2D glyph, shown in 2D mode
  private glyph: Glyph3D | null = null;
  private mode: ViewMode = "3d";
  private flatKey = "";
  private ctx: Ctx;

  private selected = false;
  private hover = false;
  private lift = 0;
  private phase = Math.random() * Math.PI * 2;
  private labelKey = "";
  private glyphKey = "";
  private ghostOpacity = 1;

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

    this.stand.position.y = SLAB_H;

    this.flat = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.flat.scale.set(FLAT_SIZE, FLAT_SIZE, 1);
    this.flat.position.y = SLAB_H + 0.06;
    this.flat.renderOrder = 5;
    this.flat.visible = false;

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    this.label.renderOrder = 6;

    this.body.add(this.slab, this.top, this.stand, this.flat);
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
    this.flatKey = "";
    this.refresh();
  }

  /** Switch between the 3D model (isometric board) and the flat glyph (2D board). */
  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.stand.visible = mode === "3d";
    this.flat.visible = mode === "2d";
    this.labelKey = ""; // the name sits at a different distance below the tile in each mode
    this.refresh();
  }

  setData(data: NodeData): void {
    this.data = data;
    this.group.position.set(data.gx * SP, 0, data.gy * SP);
    this.refresh();
  }

  private refresh(): void {
    // The 3D model is rebuilt only when the component type changes.
    if (this.glyphKey !== this.data.icon) {
      this.glyphKey = this.data.icon;
      if (this.glyph) disposeGlyph(this.glyph);
      this.glyph = createGlyph(this.data.icon);
      this.stand.add(this.glyph.group);
      if (this.ghostOpacity < 1) setOpacity(this.glyph.group, this.ghostOpacity);
    }
    if (this.flatKey !== this.data.icon) {
      this.flatKey = this.data.icon;
      this.flat.material.map = this.ctx.tex.icon(this.data.icon).tex;
      this.flat.material.needsUpdate = true;
    }
    const lk = this.data.label;
    if (this.labelKey !== lk) {
      this.labelKey = lk;
      const info = this.ctx.tex.nodeLabel(lk);
      this.label.material.map = info.tex;
      this.label.material.needsUpdate = true;
      const h = info.h * PXW;
      this.label.scale.set(info.w * PXW, h, 1);
      this.label.center.set(0.5, 1 + METRICS[this.mode].labelDrop / h);
    }
  }

  setSelected(v: boolean): void { this.selected = v; this.ring.visible = v; }
  setHover(v: boolean): void { this.hover = v; }
  /** Hide selection chrome (for PNG export). */
  setChromeVisible(v: boolean): void { this.ring.visible = v && this.selected; }

  /** Turn this view into a translucent placement preview. */
  setGhost(opacity: number, valid: boolean): void {
    this.ghostOpacity = opacity;
    if (this.glyph) setOpacity(this.glyph.group, opacity);
    for (const m of [this.slab.material, this.top.material, this.label.material, this.shadow.material, this.flat.material]) {
      m.transparent = true;
      m.opacity = opacity;
    }
    this.slab.material.color.set(valid ? this.ctx.theme.tile : "#e05a47");
    this.ring.visible = false;
  }

  /** `az` is the camera azimuth: the model turns to face the viewer, so it reads from every board angle. */
  tick(t: number, dt: number, az: number): void {
    this.stand.rotation.y = az;
    const target = this.hover || this.selected ? 1 : 0;
    this.lift += (target - this.lift) * Math.min(1, dt * 12);
    this.body.position.y = this.lift * 0.08;
    // The model breathes gently so the board feels alive.
    this.stand.position.y = SLAB_H + 0.02 + Math.sin(t * 1.6 + this.phase) * 0.012;
    this.glyph?.tick?.(t + this.phase);
    if (this.ring.visible) this.ring.material.opacity = 0.7 + Math.sin(t * 3) * 0.3;
  }

  /** Project the pick box to screen and test a pointer position. Returns camera-space depth or null. */
  hitTest(camera: THREE.Camera, ndcX: number, ndcY: number): number | null {
    const p = this.group.position;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const v = new THREE.Vector3();
    for (const dx of [-HALF, HALF]) for (const dz of [-HALF, HALF]) for (const y of [0, NODE_PICK_HEIGHT]) {
      v.set(p.x + dx, y, p.z + dz).project(camera);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    v.set(p.x, 0, p.z).applyMatrix4(camera.matrixWorldInverse);
    const depth = v.z; // larger z = closer to the camera
    return ndcX >= minX && ndcX <= maxX && ndcY >= minY && ndcY <= maxY ? depth : null;
  }

  dispose(): void {
    this.group.removeFromParent();
    if (this.glyph) disposeGlyph(this.glyph);
    this.shadow.geometry.dispose();
    this.ring.geometry.dispose();
    this.top.geometry.dispose();
    for (const m of [this.slab.material, this.top.material, this.shadow.material, this.ring.material, this.label.material, this.flat.material]) m.dispose();
  }
}
