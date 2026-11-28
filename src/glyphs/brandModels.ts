/**
 * The 3D versions of the tool logos: each logo's own shape, raised into a solid standing emblem. The depth is
 * made from thin copies of the logo stacked behind its front face, so any shape works, gradients included.
 * Dark or thin logos stand on a light rounded badge.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { BrandKey } from "../model/brandKeys";
import { BRAND_LOGOS } from "./brandLogos";
import { logoCells } from "./logoGrid";
import { logoImage } from "./logoTexture";

/** Width and height shared by the emblems of one box. A box with several logos uses more of its tile. */
const ONE_SPAN = 1.24, MANY_SPAN = 1.36;
const LAYERS = 18;

/** A texture of the logo, or null where there is no browser (tests). */
function texture(key: BrandKey): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const image = logoImage(key);
  const tex = new THREE.CanvasTexture(image.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  void image.ready.then(() => { tex.needsUpdate = true; });
  return tex;
}

/** One emblem in a square of side `cell`, centred on the origin, with its back at z = 0. */
function emblem(key: BrandKey, cell: number): THREE.Group {
  const g = new THREE.Group();
  const logo = BRAND_LOGOS[key];
  const depth = Math.max(0.11, cell * 0.16);
  const room = cell * (logo.plate ? 0.74 : logo.tile ? 0.9 : 0.92);
  const scale = room / Math.max(logo.w, logo.h);
  const w = logo.w * scale, h = logo.h * scale;
  let back = 0, thick = depth;

  if (logo.plate) {
    const side = cell * 0.94, slab = depth * 0.8;
    const badge = new THREE.Mesh(
      new RoundedBoxGeometry(side, side, slab, 3, Math.min(slab / 2 - 1e-3, side * 0.14)),
      new THREE.MeshStandardMaterial({ color: "#f4f5f8", roughness: 0.5, metalness: 0.05, emissive: "#ffffff", emissiveIntensity: 0.22 }),
    );
    badge.position.z = slab / 2;
    g.add(badge);
    back = slab;
    thick = depth * 0.45; // the logo is raised a little from the badge
  }

  const map = texture(key);
  const layers = Array.from({ length: LAYERS }, (_, i) => new THREE.PlaneGeometry(w, h).translate(0, 0, back + (thick * i) / LAYERS));
  const sides = new THREE.Mesh(mergeGeometries(layers), new THREE.MeshStandardMaterial({ map, color: "#8f949e", roughness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide }));
  for (const l of layers) l.dispose();
  // The front is unlit so the brand colours stay exact.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, alphaTest: 0.35, transparent: true, side: THREE.DoubleSide }));
  front.position.z = back + thick;
  g.add(sides, front);
  return g;
}

/** The emblems for a box: one large one, or a small wall of them when the box names several tools. */
export function brandModel(keys: BrandKey[]): THREE.Group {
  const root = new THREE.Group();
  const cells = logoCells(keys.length);
  const span = keys.length > 1 ? MANY_SPAN : ONE_SPAN;
  const bottom = Math.max(...cells.map((c) => c.y + c.size / 2));
  keys.forEach((key, i) => {
    const cell = cells[i];
    const size = cell.size * span;
    const e = emblem(key, size);
    const rise = (bottom - cell.y - cell.size / 2) * span; // height of this row above the bottom one
    e.position.set(cell.x * span, rise + size / 2 + 0.015, -0.06 - rise * 0.16); // upper rows sit a little further back
    root.add(e);
  });
  return root;
}
