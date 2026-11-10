import * as THREE from "three";
import { iconSvg } from "../glyphs/flatIcons";
import type { IconKey, TextSize } from "../model/types";
import { FONT, Theme } from "../theme";

export interface TexInfo { tex: THREE.Texture; w: number; h: number }

/** Greedy word wrap, same rule as the board style (about 18 characters per label line). */
export function wrap(text: string, max: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(font: string, text: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

const SCALE = 3; // texture pixels per CSS pixel

/** Builds and caches every texture the scene needs for one theme. Recreate it when the theme changes. */
export class TextureFactory {
  private cache = new Map<string, TexInfo>();

  constructor(readonly theme: Theme) {}

  private canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): TexInfo {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(w * SCALE));
    cv.height = Math.max(1, Math.ceil(h * SCALE));
    const c = cv.getContext("2d")!;
    c.scale(SCALE, SCALE);
    draw(c);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const info = { tex, w, h };
    this.cache.set(key, info);
    return info;
  }

  /** The flat 2D glyph, rasterised for the 2D view mode. Loads asynchronously and updates itself. */
  icon(icon: IconKey): TexInfo {
    const key = "icon:" + icon;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const img = new Image();
    img.onload = () => { tex.image = img; tex.needsUpdate = true; };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(iconSvg(icon, this.theme.fg, 256));
    const info = { tex, w: 52, h: 52 };
    this.cache.set(key, info);
    return info;
  }

  /** Component name that hangs under a tile. */
  nodeLabel(text: string): TexInfo {
    const lines = wrap(text || " ", 18);
    const font = `500 14px ${FONT}`;
    const w = Math.ceil(Math.max(...lines.map((l) => measure(font, l)))) + 12;
    const h = lines.length * 16 + 6;
    return this.canvasTex(`label:${lines.join("|")}`, w, h, (c) => {
      c.font = font;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      c.lineJoin = "round";
      lines.forEach((l, i) => {
        const y = 15 + i * 16;
        // Halo in the board colour keeps the text readable where it crosses grid lines or arrows.
        c.strokeStyle = this.theme.board;
        c.lineWidth = 4;
        c.strokeText(l, w / 2, y);
        c.fillStyle = this.theme.fg;
        c.fillText(l, w / 2, y);
      });
    });
  }

  /** A free text box: several lines, optionally inside a bordered box. Blank text shows a faint "Text". */
  textBox(text: string, size: TextSize, boxed: boolean): TexInfo {
    const px = { s: 13, m: 17, l: 25 }[size];
    const blank = text.trim() === "";
    const lines = (blank ? "Text" : text).split(/\r?\n/).flatMap((l) => wrap(l, 34));
    const font = `${size === "l" ? 600 : 500} ${px}px ${FONT}`;
    const lineH = Math.round(px * 1.32);
    const padX = boxed ? 13 : 6, padY = boxed ? 9 : 4;
    const w = Math.ceil(Math.max(...lines.map((l) => measure(font, l)))) + padX * 2;
    const h = lines.length * lineH + padY * 2;
    return this.canvasTex(`text:${size}:${boxed}:${blank}:${lines.join("|")}`, w, h, (c) => {
      if (boxed) {
        c.beginPath();
        c.roundRect(1, 1, w - 2, h - 2, 9);
        c.fillStyle = this.theme.board;
        c.fill();
        c.lineWidth = 1.6;
        c.strokeStyle = this.theme.tile;
        c.stroke();
      }
      c.font = font;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineJoin = "round";
      lines.forEach((l, i) => {
        const y = padY + i * lineH + lineH / 2;
        if (!boxed) {
          c.strokeStyle = this.theme.board;
          c.lineWidth = 4;
          c.strokeText(l, w / 2, y);
        }
        c.fillStyle = blank ? this.theme.muted : this.theme.fg;
        c.fillText(l, w / 2, y);
      });
    });
  }

  /** Accent outline drawn around a selected or hovered text box. Includes room for the glow. */
  textOutline(w: number, h: number): TexInfo {
    const m = 8;
    return this.canvasTex(`textOutline:${w}x${h}`, w + m * 2, h + m * 2, (c) => {
      c.shadowColor = this.theme.accent;
      c.shadowBlur = 7;
      c.beginPath();
      c.roundRect(m, m, w, h, 10);
      c.lineWidth = 2.4;
      c.strokeStyle = this.theme.accent;
      c.stroke();
    });
  }

  /** Small label on an arrow. */
  pill(text: string, hot: boolean): TexInfo {
    const lines = wrap(text, 16);
    const font = `${hot ? 600 : 400} 12px ${FONT}`;
    const w = Math.ceil(Math.max(...lines.map((l) => measure(font, l)))) + 16;
    const h = lines.length * 14 + 9;
    return this.canvasTex(`pill:${hot}:${lines.join("|")}`, w + 2, h + 2, (c) => {
      c.translate(1, 1);
      c.beginPath();
      c.roundRect(0, 0, w, h, 6);
      c.fillStyle = this.theme.board;
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = hot ? this.theme.accent : this.theme.tile;
      c.stroke();
      c.font = font;
      c.textAlign = "center";
      c.fillStyle = hot ? this.theme.accent : this.theme.muted;
      lines.forEach((l, i) => c.fillText(l, w / 2, 15 + i * 14));
    });
  }

  /** Numbered purple step badge. */
  badge(n: number): TexInfo {
    return this.canvasTex(`badge:${n}`, 28, 28, (c) => {
      c.beginPath();
      c.arc(14, 14, 11, 0, Math.PI * 2);
      c.fillStyle = this.theme.board;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = this.theme.step;
      c.stroke();
      c.font = `700 12.5px ${FONT}`;
      c.textAlign = "center";
      c.fillStyle = this.theme.step;
      c.fillText(String(n), 14, 18.5);
    });
  }

  /** Dotted rounded outline that sits on top of each tile, as in the board style. */
  tileTop(): TexInfo {
    return this.canvasTex("tileTop", 128, 128, (c) => {
      c.beginPath();
      c.roundRect(7, 7, 114, 114, 18);
      c.setLineDash([1.5, 7]);
      c.lineCap = "round";
      c.lineWidth = 3.6;
      c.strokeStyle = this.theme.muted;
      c.stroke();
    });
  }

  /** Soft accent outline shown around selected tiles. */
  ring(): TexInfo {
    return this.canvasTex("ring", 128, 128, (c) => {
      c.shadowColor = this.theme.accent;
      c.shadowBlur = 10;
      c.beginPath();
      c.roundRect(14, 14, 100, 100, 18);
      c.lineWidth = 4;
      c.strokeStyle = this.theme.accent;
      c.stroke();
    });
  }

  /** Soft blob shadow under a tile. */
  shadow(): TexInfo {
    return this.canvasTex("shadow", 64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
  }

  dispose(): void {
    for (const t of this.cache.values()) t.tex.dispose();
    this.cache.clear();
  }
}

export interface Ctx { theme: Theme; tex: TextureFactory }
