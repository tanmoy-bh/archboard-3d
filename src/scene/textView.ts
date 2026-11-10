import * as THREE from "three";
import type { TextData } from "../model/types";
import { PXW, SP } from "./constants";
import type { Ctx } from "./textures";

/**
 * One free text box. It is a screen-facing sprite anchored on the floor, so it stays upright and readable
 * from every board angle and in both 2D and 3D, and it is drawn above tiles and arrows.
 */
export class TextView {
  readonly group = new THREE.Group();
  data: TextData;

  private body: THREE.Sprite;
  private outline: THREE.Sprite;
  private ctx: Ctx;
  private key = "";
  private w = 1; // size in CSS pixels
  private h = 1;
  private selected = false;
  private hover = false;
  private chrome = true;

  constructor(data: TextData, ctx: Ctx) {
    this.data = data;
    this.ctx = ctx;
    this.outline = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    this.outline.renderOrder = 7;
    this.body = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    this.body.renderOrder = 8;
    this.group.add(this.outline, this.body);
    this.setData(data);
  }

  applyTheme(ctx: Ctx): void {
    this.ctx = ctx;
    this.key = "";
    this.refresh();
  }

  setData(data: TextData): void {
    this.data = data;
    this.group.position.set(data.gx * SP, 0, data.gy * SP);
    this.refresh();
  }

  private refresh(): void {
    const d = this.data;
    const key = `${d.size}|${d.boxed ? 1 : 0}|${d.text}`;
    if (key !== this.key) {
      this.key = key;
      const info = this.ctx.tex.textBox(d.text, d.size, !!d.boxed);
      this.w = info.w; this.h = info.h;
      this.body.material.map = info.tex;
      this.body.material.needsUpdate = true;
      this.body.scale.set(info.w * PXW, info.h * PXW, 1);
      const o = this.ctx.tex.textOutline(info.w, info.h);
      this.outline.material.map = o.tex;
      this.outline.material.needsUpdate = true;
      this.outline.scale.set(o.w * PXW, o.h * PXW, 1);
    }
    this.updateOutline();
  }

  /** Size in screen-facing world units, used to fit the board and crop exports. */
  get worldSize(): { w: number; h: number } { return { w: this.w * PXW, h: this.h * PXW }; }

  private updateOutline(): void {
    const show = this.chrome && (this.selected || this.hover);
    this.outline.visible = show;
    this.outline.material.opacity = this.selected ? 1 : 0.5;
  }

  setSelected(v: boolean): void { this.selected = v; this.updateOutline(); }
  setHover(v: boolean): void { this.hover = v; this.updateOutline(); }
  /** Hide selection chrome (for PNG export). */
  setChromeVisible(v: boolean): void { this.chrome = v; this.updateOutline(); }

  /** Is the pointer (in normalised device coordinates) inside the text box? Returns the distance to its centre. */
  hitTest(camera: THREE.OrthographicCamera, ndcX: number, ndcY: number): number | null {
    const c = new THREE.Vector3(this.group.position.x, 0, this.group.position.z).project(camera);
    const frustumW = (camera.right - camera.left) / camera.zoom;
    const frustumH = (camera.top - camera.bottom) / camera.zoom;
    const hw = (this.w * PXW) / frustumW, hh = (this.h * PXW) / frustumH; // half sizes in NDC (NDC spans 2)
    return Math.abs(ndcX - c.x) <= hw && Math.abs(ndcY - c.y) <= hh ? Math.hypot(ndcX - c.x, ndcY - c.y) : null;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.body.material.dispose();
    this.outline.material.dispose();
  }
}
