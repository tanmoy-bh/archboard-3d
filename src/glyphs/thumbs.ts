import * as THREE from "three";
import { ICON_KEYS, IconKey } from "../model/types";
import type { ViewMode } from "../scene/constants";
import { iconSvg } from "./flatIcons";
import { createGlyph, disposeGlyph } from "./models";

let cache: Map<IconKey, string> | null = null;
const SIZE = 128;

/**
 * Small pictures of the 3D models for the palette and legend. Each one is a render of the real model
 * seen from the board's default camera angle, so what you pick is what you get. Rendered once, lazily.
 * Returns an empty map when WebGL is not available (the UI then falls back to text only).
 */
export function glyphThumbnails(): Map<IconKey, string> {
  if (cache) return cache;
  cache = new Map();
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight("#ffffff", "#7a8190", 1.9);
    const sun = new THREE.DirectionalLight("#ffffff", 1.35);
    sun.position.set(-8, 14, 6);
    scene.add(hemi, sun);

    const cam = new THREE.OrthographicCamera(-0.95, 0.95, 1.2, -0.7, 0.1, 50);
    const e = Math.atan(1 / Math.SQRT2), az = Math.PI / 4, d = 20;
    cam.position.set(d * Math.cos(e) * Math.sin(az), 0.55 + d * Math.sin(e), d * Math.cos(e) * Math.cos(az));
    cam.lookAt(0, 0.55, 0);

    for (const key of ICON_KEYS) {
      const glyph = createGlyph(key);
      glyph.tick?.(0.7);
      glyph.group.rotation.y = az; // faces the camera, as it does on the board
      scene.add(glyph.group);
      renderer.render(scene, cam);
      cache.set(key, renderer.domElement.toDataURL("image/png"));
      scene.remove(glyph.group);
      disposeGlyph(glyph);
    }
  } catch {
    cache = new Map();
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  return cache;
}

const flatCache = new Map<string, string>();

/**
 * The picture shown for a glyph in the palette and legend: a render of the 3D model in 3D mode, or the
 * flat drawing in 2D mode. Undefined when a 3D render is not available (no WebGL).
 */
export function glyphImage(icon: IconKey, mode: ViewMode, fg: string): string | undefined {
  if (mode === "3d") return glyphThumbnails().get(icon);
  const key = fg + icon;
  let url = flatCache.get(key);
  if (!url) {
    url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(iconSvg(icon, fg, 96));
    flatCache.set(key, url);
  }
  return url;
}
