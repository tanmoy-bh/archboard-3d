/**
 * Real 3D versions of the architecture board glyphs. Each glyph keeps the shapes and colours of its 2D
 * original (stacked green boxes for a service, blue disc stacks for a database, a padlock, a funnel and
 * so on) but is built from lit geometry, so it has depth, shading and turns with the board.
 *
 * Conventions: a model stands on y = 0, fits roughly inside a 1.3 x 1.3 footprint and is at most about
 * 1.3 tall. The front of a model faces local +z; createGlyph() turns it toward the default camera.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { IconKey } from "../model/types";

export interface Glyph3D {
  group: THREE.Group;
  /** Optional idle animation. t is seconds. */
  tick?: (t: number) => void;
}

type V3 = [number, number, number];
interface Opts { rough?: number; metal?: number; emissive?: string; ei?: number; opacity?: number; side?: THREE.Side; r?: number }

// ------------------------------------------------------------------ helpers

function material(color: string, o: Opts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.05, side: o.side ?? THREE.FrontSide });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  if (o.opacity !== undefined) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
  return m;
}

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Rounded box whose bottom face is at yb. */
function box(p: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, yb: number, z: number, o: Opts = {}): THREE.Mesh {
  const r = Math.max(0.002, Math.min(o.r ?? 0.05, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  return mesh(p, new RoundedBoxGeometry(w, h, d, 3, r), material(color, o), x, yb + h / 2, z);
}

/** Cylinder (or cone frustum) whose bottom is at yb. */
function cyl(p: THREE.Object3D, rt: number, rb: number, h: number, color: string, x: number, yb: number, z: number, o: Opts = {}, open = false): THREE.Mesh {
  return mesh(p, new THREE.CylinderGeometry(rt, rb, h, 40, 1, open), material(color, o), x, yb + h / 2, z);
}

function ball(p: THREE.Object3D, r: number, color: string, x: number, y: number, z: number, o: Opts = {}): THREE.Mesh {
  return mesh(p, new THREE.SphereGeometry(r, 28, 18), material(color, o), x, y, z);
}

function torus(p: THREE.Object3D, R: number, t: number, color: string, x: number, y: number, z: number, rot: V3 = [0, 0, 0], arc = Math.PI * 2, o: Opts = {}): THREE.Mesh {
  const m = mesh(p, new THREE.TorusGeometry(R, t, 14, 48, arc), material(color, o), x, y, z);
  m.rotation.set(rot[0], rot[1], rot[2]);
  return m;
}

/** Thin cylinder joining two points. */
function between(p: THREE.Object3D, a: V3, b: V3, r: number, color: string, o: Opts = {}): THREE.Mesh {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = mesh(p, new THREE.CylinderGeometry(r, r, len, 12), material(color, o), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return m;
}

/** A canvas texture for small printed details (browser only; skipped under test). */
function decal(text: string, color: string, w = 256, h = 128): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  if (!c) return null;
  c.font = `700 ${Math.round(h * 0.62)}px ui-monospace, Menlo, monospace`;
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = color;
  c.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Printed text on a plane that sits in front of a model. Browser only (skipped under test). */
function plaque(p: THREE.Object3D, text: string, color: string, width: number, x: number, y: number, z: number, texW = 256): void {
  const tex = decal(text, color, texW, 128);
  if (tex) mesh(p, new THREE.PlaneGeometry(width, (width * 128) / texW), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), x, y, z);
}

/** A thin shaft with a cone head at `to`, the head's base resting on the end of the shaft. */
function arrow(p: THREE.Object3D, from: V3, to: V3, r: number, color: string, head = 0.17, o: Opts = {}): void {
  const A = new THREE.Vector3(...from), B = new THREE.Vector3(...to);
  const dir = B.clone().sub(A).normalize();
  const shaftEnd = B.clone().addScaledVector(dir, -head * 0.6);
  between(p, from, [shaftEnd.x, shaftEnd.y, shaftEnd.z], r, color, o);
  const cone = mesh(p, new THREE.ConeGeometry(r * 2.8, head, 18), material(color, o), B.x, B.y, B.z);
  cone.position.addScaledVector(dir, -head / 2);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}

const discStack = (g: THREE.Group, colors: string[], edge: string): void => {
  colors.forEach((c, i) => {
    cyl(g, 0.52, 0.52, 0.3, c, 0, i * 0.34, 0, { rough: 0.4 });
    torus(g, 0.52, 0.018, edge, 0, i * 0.34 + 0.3, 0, [Math.PI / 2, 0, 0]);
  });
};

// ------------------------------------------------------------------- models

const BUILD: Record<IconKey, () => Glyph3D> = {
  /** Service: three stacked green layers with status lights. */
  svc() {
    const g = new THREE.Group();
    ["#2e7d32", "#3b9442", "#4caf50"].forEach((c, i) => {
      const y = i * 0.34;
      box(g, 1.0, 0.3, 0.78, c, 0, y, 0, { r: 0.07 });
      ball(g, 0.035, "#c8ffd0", 0.38, y + 0.15, 0.4, { emissive: "#7dff9a", ei: 1.3 });
      box(g, 0.5, 0.02, 0.01, "#1b4d1f", -0.1, y + 0.14, 0.392, { r: 0.004 });
    });
    return { group: g };
  },

  /** Redis / cache: the Redis mark. Three stacked red diamond layers with the white disc and arrow on top. */
  redis() {
    const g = new THREE.Group();
    const side = 0.86, h = 0.17;
    ["#a9261a", "#c8301f", "#e8453a"].forEach((c, i) => {
      const plate = box(g, side, h, side, c, 0, i * 0.27, 0, { r: 0.08, rough: 0.45 });
      plate.rotation.y = Math.PI / 4; // a corner points at the viewer, so each layer reads as a diamond
    });
    const top = 2 * 0.27 + h + 0.004;
    const disc = cyl(g, 0.14, 0.14, 0.012, "#ffffff", -0.14, top, 0.02, { rough: 0.4 });
    disc.scale.set(1.25, 1, 0.8);
    const arrowhead = mesh(g, new THREE.ConeGeometry(0.1, 0.36, 3), material("#ffffff", { rough: 0.4 }), 0.2, top + 0.03, 0.02);
    arrowhead.rotation.z = -Math.PI / 2; // lies flat, pointing right
    arrowhead.scale.set(1, 1, 0.3);
    return { group: g };
  },

  /** Database: three stacked blue discs. */
  db() {
    const g = new THREE.Group();
    discStack(g, ["#3d8bf0", "#5aa2ff", "#5aa2ff"], "#1d4f9e");
    return { group: g };
  },

  /** Search index: yellow discs with a magnifying glass. */
  es() {
    const g = new THREE.Group();
    discStack(g, ["#f0b232", "#f6c24c", "#f6c24c"], "#93630a");
    const lens = new THREE.Group();
    lens.position.set(0.3, 1.32, 0.15);
    lens.rotation.x = -0.9;
    torus(lens, 0.25, 0.05, "#7a4f00", 0, 0, 0);
    mesh(lens, new THREE.CircleGeometry(0.24, 32), material("#fff3c4", { opacity: 0.55, side: THREE.DoubleSide }), 0, 0, 0);
    box(lens, 0.08, 0.34, 0.08, "#7a4f00", 0, -0.6, 0, { r: 0.03 }); // handle
    g.add(lens);
    return { group: g };
  },

  /** Vector DB: purple discs with embeddings floating above. */
  vector() {
    const g = new THREE.Group();
    discStack(g, ["#8f72ee", "#a58cf5", "#a58cf5"], "#4b2fa3");
    const dots: V3[] = [[-0.25, 1.3, 0.1], [0.2, 1.45, -0.1], [0.05, 1.18, 0.28], [0.32, 1.22, 0.2], [-0.1, 1.5, -0.2]];
    const balls = dots.map((d) => ball(g, 0.065, "#ffffff", d[0], d[1], d[2], { emissive: "#ffffff", ei: 0.7 }));
    return { group: g, tick: (t) => balls.forEach((b, i) => { b.position.y = dots[i][1] + Math.sin(t * 1.8 + i * 1.7) * 0.04; }) };
  },

  /** Queue: a translucent tube holding two envelopes. */
  queue() {
    const g = new THREE.Group();
    const tube = mesh(g, new THREE.CapsuleGeometry(0.34, 0.9, 8, 24), material("#35b8a6", { opacity: 0.26, rough: 0.2 }), 0, 0.48, 0);
    tube.rotation.z = Math.PI / 2;
    for (const x of [-0.62, 0.62]) torus(g, 0.34, 0.025, "#136b5f", x, 0.48, 0, [0, Math.PI / 2, 0]);
    for (const x of [-0.3, 0.3]) {
      box(g, 0.4, 0.26, 0.5, "#35b8a6", x, 0.34, 0, { r: 0.03 });
      box(g, 0.4, 0.02, 0.2, "#136b5f", x, 0.6, 0.12, { r: 0.005 });
    }
    cyl(g, 0.05, 0.05, 0.16, "#136b5f", -0.5, 0, 0);
    cyl(g, 0.05, 0.05, 0.16, "#136b5f", 0.5, 0, 0);
    return { group: g };
  },

  /** CDN: a pink cloud. */
  cdn() {
    const g = new THREE.Group();
    const c = "#ec6fae";
    const o = { rough: 0.7 };
    ball(g, 0.34, c, -0.42, 0.42, 0, o);
    ball(g, 0.46, c, -0.02, 0.62, 0, o);
    ball(g, 0.33, c, 0.44, 0.42, 0, o);
    ball(g, 0.3, c, 0.12, 0.38, 0.22, o);
    const base = ball(g, 0.62, c, 0, 0.28, 0, o);
    base.scale.set(1.12, 0.45, 0.7);
    return { group: g, tick: (t) => { g.position.y = Math.sin(t * 1.4) * 0.03; } };
  },

  /** Mobile client. */
  phone() {
    const g = new THREE.Group();
    const lean = new THREE.Group();
    lean.rotation.x = -0.16;
    lean.position.y = 0.04;
    box(lean, 0.56, 1.1, 0.1, "#9aa0a8", 0, 0, 0, { r: 0.07, metal: 0.4, rough: 0.35 });
    box(lean, 0.46, 0.94, 0.012, "#eceef1", 0, 0.08, 0.052, { r: 0.012, emissive: "#9fc4ff", ei: 0.35 });
    box(lean, 0.12, 0.018, 0.014, "#4b5058", 0, 1.0, 0.056, { r: 0.006 });
    cyl(lean, 0.06, 0.06, 0.03, "#4b5058", -0.14, 0.9, -0.1).rotation.x = Math.PI / 2;
    g.add(lean);
    return { group: g };
  },

  /** Web client: a laptop. */
  laptop() {
    const g = new THREE.Group();
    box(g, 1.1, 0.07, 0.78, "#b9bec6", 0, 0, 0.05, { r: 0.03, metal: 0.4, rough: 0.35 });
    box(g, 0.34, 0.012, 0.2, "#9aa0a8", 0, 0.07, 0.22, { r: 0.005 });
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.07, -0.34);
    hinge.rotation.x = -0.26;
    box(hinge, 1.1, 0.72, 0.05, "#9aa0a8", 0, 0, 0, { r: 0.03, metal: 0.4, rough: 0.35 });
    box(hinge, 0.98, 0.6, 0.012, "#eceef1", 0, 0.06, 0.028, { r: 0.01, emissive: "#8fb7ff", ei: 0.4 });
    g.add(hinge);
    return { group: g };
  },

  /** Person. */
  person() {
    const g = new THREE.Group();
    const c = "#7fa6dd";
    cyl(g, 0.27, 0.42, 0.62, c, 0, 0, 0, { rough: 0.6 });
    const sh = ball(g, 0.27, c, 0, 0.62, 0, { rough: 0.6 });
    sh.scale.set(1, 0.55, 0.9);
    ball(g, 0.24, "#a9c4ec", 0, 0.98, 0, { rough: 0.5 });
    return { group: g, tick: (t) => { g.rotation.y = Math.sin(t * 0.8) * 0.2; } };
  },

  /** LB / gateway: a teal door with the code mark. */
  gateway() {
    const g = new THREE.Group();
    box(g, 0.78, 1.24, 0.5, "#3fb0a2", 0, 0, 0, { r: 0.09, metal: 0.2 });
    box(g, 0.05, 0.78, 0.02, "#16685e", -0.22, 0.22, 0.255, { r: 0.008 });
    box(g, 0.05, 0.78, 0.02, "#16685e", 0.22, 0.22, 0.255, { r: 0.008 });
    const tex = decal("</>", "#0d3d37");
    if (tex) mesh(g, new THREE.PlaneGeometry(0.44, 0.22), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), 0, 0.62, 0.262);
    box(g, 0.9, 0.08, 0.6, "#16685e", 0, 0, 0, { r: 0.03 });
    return { group: g };
  },

  /** Object storage: a bucket. */
  blob() {
    const g = new THREE.Group();
    cyl(g, 0.52, 0.38, 0.86, "#ef7d45", 0, 0, 0, { rough: 0.5 });
    cyl(g, 0.5, 0.5, 0.05, "#f39a68", 0, 0.86, 0);
    torus(g, 0.52, 0.04, "#8a3a12", 0, 0.9, 0, [Math.PI / 2, 0, 0]);
    torus(g, 0.45, 0.022, "#8a3a12", 0, 0.62, 0, [Math.PI / 2, 0, 0]);
    torus(g, 0.41, 0.022, "#8a3a12", 0, 0.28, 0, [Math.PI / 2, 0, 0]);
    return { group: g };
  },

  /** Payment provider: a card with chip and stripe. */
  card() {
    const g = new THREE.Group();
    const lean = new THREE.Group();
    lean.rotation.x = -0.3;
    lean.position.y = 0.02;
    box(lean, 1.1, 0.7, 0.06, "#6d78ff", 0, 0, 0, { r: 0.05, rough: 0.35, metal: 0.2 });
    box(lean, 1.1, 0.12, 0.064, "#2b33a8", 0, 0.46, 0, { r: 0.004 });
    box(lean, 0.18, 0.13, 0.068, "#f6c24c", -0.34, 0.24, 0, { r: 0.02, metal: 0.7, rough: 0.25 });
    box(lean, 0.3, 0.04, 0.068, "#dfe3ff", -0.3, 0.1, 0, { r: 0.01 });
    box(lean, 0.18, 0.04, 0.068, "#dfe3ff", 0.26, 0.1, 0, { r: 0.01 });
    g.add(lean);
    return { group: g };
  },

  /** Notifications: a bell that gives a small swing. */
  bell() {
    const g = new THREE.Group();
    const pts = [[0.55, 0.0], [0.5, 0.08], [0.44, 0.2], [0.38, 0.5], [0.3, 0.76], [0.16, 0.92], [0.04, 0.98]].map(([x, y]) => new THREE.Vector2(x, y));
    const swing = new THREE.Group();
    swing.position.y = 1.0;
    // The lathe profile runs from the rim (y 0) to the crown (y 0.98); hang it from a pivot at the top.
    mesh(swing, new THREE.LatheGeometry(pts, 40), material("#f6c24c", { metal: 0.55, rough: 0.28, side: THREE.DoubleSide }), 0, -0.98, 0);
    ball(swing, 0.07, "#8a5a00", 0, 0.02, 0, { metal: 0.4 }); // crown knob
    ball(swing, 0.1, "#8a5a00", 0, -0.92, 0, { metal: 0.4 }); // clapper
    g.add(swing);
    return { group: g, tick: (t) => { swing.rotation.z = Math.sin(t * 2.2) * 0.07; } };
  },

  /** Email: an envelope with a flap and seal. */
  mail() {
    const g = new THREE.Group();
    box(g, 1.0, 0.7, 0.12, "#5aa2ff", 0, 0.1, 0, { r: 0.035 });
    const flap = new THREE.Shape();
    flap.moveTo(-0.5, 0.35); flap.lineTo(0.5, 0.35); flap.lineTo(0, -0.02); flap.closePath();
    mesh(g, new THREE.ExtrudeGeometry(flap, { depth: 0.03, bevelEnabled: false }), material("#8bbcff"), 0, 0.45, 0.06);
    const side = (sx: number) => {
      const s = new THREE.Shape();
      s.moveTo(sx * 0.5, -0.35); s.lineTo(sx * 0.5, 0.3); s.lineTo(0, -0.02); s.closePath();
      mesh(g, new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), material("#4a90f0"), 0, 0.45, 0.06);
    };
    side(-1); side(1);
    cyl(g, 0.07, 0.07, 0.03, "#e05a47", 0, 0.41, 0.1).rotation.x = Math.PI / 2;
    return { group: g };
  },

  /** SMS: a speech bubble with three dots. */
  sms() {
    const g = new THREE.Group();
    box(g, 1.08, 0.72, 0.32, "#4caf50", 0, 0.3, 0, { r: 0.16 });
    const tail = mesh(g, new THREE.ConeGeometry(0.17, 0.3, 4), material("#4caf50"), -0.3, 0.2, 0);
    tail.rotation.y = Math.PI / 4;
    tail.rotation.x = Math.PI;
    [-0.24, 0, 0.24].forEach((x) => ball(g, 0.065, "#ffffff", x, 0.66, 0.165, { emissive: "#ffffff", ei: 0.4 }));
    return { group: g };
  },

  /** AI model / agent: a chip with pins and a spinning spark. */
  ai() {
    const g = new THREE.Group();
    box(g, 0.9, 0.16, 0.9, "#f0845c", 0, 0.06, 0, { r: 0.05, metal: 0.3 });
    box(g, 0.6, 0.05, 0.6, "#8a2f12", 0, 0.22, 0, { r: 0.02 });
    for (let i = -2; i <= 2; i++) {
      const p = i * 0.16;
      box(g, 0.1, 0.05, 0.14, "#d9d2c8", p, 0.1, 0.52, { r: 0.01, metal: 0.8, rough: 0.3 });
      box(g, 0.1, 0.05, 0.14, "#d9d2c8", p, 0.1, -0.52, { r: 0.01, metal: 0.8, rough: 0.3 });
      box(g, 0.14, 0.05, 0.1, "#d9d2c8", 0.52, 0.1, p, { r: 0.01, metal: 0.8, rough: 0.3 });
      box(g, 0.14, 0.05, 0.1, "#d9d2c8", -0.52, 0.1, p, { r: 0.01, metal: 0.8, rough: 0.3 });
    }
    const star = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, r = i % 2 === 0 ? 0.32 : 0.09;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.closePath();
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.05, bevelEnabled: false });
    sg.translate(0, 0, -0.025);
    const spark = mesh(g, sg, material("#ffffff", { emissive: "#ffd9c8", ei: 0.9 }), 0, 0.82, 0);
    spark.rotation.x = -Math.PI / 2.4;
    return { group: g, tick: (t) => { spark.rotation.z = t * 1.2; spark.position.y = 0.82 + Math.sin(t * 2) * 0.05; } };
  },

  /** Documents / logs: three fanned sheets. */
  doc() {
    const g = new THREE.Group();
    // back to front: [colour, z, turn about y]
    const sheets: [string, number, number][] = [["#b5c0d0", -0.22, -0.25], ["#c9d2df", 0, 0], ["#e8edf4", 0.22, 0.25]];
    sheets.forEach(([c, z, turn], i) => {
      const sheet = new THREE.Group();
      sheet.position.set(0, 0.02, z);
      sheet.rotation.y = turn;
      box(sheet, 0.72, 0.98, 0.05, c, 0, 0, 0, { r: 0.015 });
      if (i === 2) {
        // lines of text on the front sheet
        [0.74, 0.6, 0.46, 0.32].forEach((y, k) => box(sheet, k === 3 ? 0.28 : 0.48, 0.035, 0.01, "#4b5a70", k === 3 ? -0.1 : 0, y, 0.03, { r: 0.004 }));
      }
      g.add(sheet);
    });
    return { group: g };
  },

  /** Graph: linked spheres. */
  graph() {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    const centre: V3 = [0, 0.7, 0];
    const others: V3[] = [[-0.52, 0.38, 0.2], [0.5, 0.95, -0.1], [-0.42, 1.08, -0.22], [0.46, 0.3, 0.34]];
    others.forEach((o) => between(spin, centre, o, 0.03, "#7b5cd6"));
    between(spin, others[0], others[2], 0.025, "#7b5cd6");
    ball(spin, 0.2, "#a58cf5", centre[0], centre[1], centre[2], { rough: 0.35 });
    others.forEach((o) => ball(spin, 0.14, "#c9b8ff", o[0], o[1], o[2], { rough: 0.35 }));
    cyl(g, 0.55, 0.6, 0.05, "#4b2fa3", 0, 0, 0, { opacity: 0.45 });
    g.add(spin);
    return { group: g, tick: (t) => { spin.rotation.y = t * 0.5; } };
  },

  /** Lock / lease: a padlock. */
  lock() {
    const g = new THREE.Group();
    box(g, 0.86, 0.6, 0.44, "#e05a47", 0, 0, 0, { r: 0.08, metal: 0.3, rough: 0.4 });
    torus(g, 0.25, 0.075, "#8a1f12", 0, 0.6, 0, [0, 0, 0], Math.PI, { metal: 0.7, rough: 0.3 });
    cyl(g, 0.075, 0.075, 0.22, "#8a1f12", -0.25, 0.6, 0, { metal: 0.7 }).position.y = 0.6;
    cyl(g, 0.075, 0.075, 0.22, "#8a1f12", 0.25, 0.6, 0, { metal: 0.7 }).position.y = 0.6;
    cyl(g, 0.07, 0.07, 0.02, "#4a0f08", 0, 0.34, 0.225).rotation.x = Math.PI / 2;
    box(g, 0.05, 0.14, 0.02, "#4a0f08", 0, 0.18, 0.225, { r: 0.008 });
    return { group: g };
  },

  /** Dashboard: a small 3D bar chart on a plate. */
  chart() {
    const g = new THREE.Group();
    box(g, 1.14, 0.1, 0.84, "#e9edf3", 0, 0, 0, { r: 0.04 });
    ([[-0.33, 0.45, "#5aa2ff"], [0, 0.78, "#4caf50"], [0.33, 1.1, "#f6c24c"]] as const).forEach(([x, h, c]) => {
      box(g, 0.24, h, 0.26, c, x, 0.1, 0, { r: 0.03, rough: 0.4 });
    });
    return { group: g };
  },

  /** Hash ring: a tilted ring with coloured nodes. */
  ring() {
    const g = new THREE.Group();
    cyl(g, 0.04, 0.04, 0.5, "#4b5058", 0, 0, 0);
    cyl(g, 0.34, 0.4, 0.06, "#4b5058", 0, 0, 0);
    const tilt = new THREE.Group();
    tilt.position.y = 0.88;
    tilt.rotation.x = 0.35;
    const spin = new THREE.Group();
    tilt.add(spin);
    torus(spin, 0.5, 0.075, "#7b5cd6", 0, 0, 0, [Math.PI / 2, 0, 0], Math.PI * 2, { rough: 0.35 });
    ["#4caf50", "#5aa2ff", "#f6c24c", "#e05a47"].forEach((c, i) => {
      const a = (i * Math.PI) / 2 + 0.4;
      ball(spin, 0.14, c, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, { rough: 0.3 });
    });
    g.add(tilt);
    return { group: g, tick: (t) => { spin.rotation.y = t * 0.6; } };
  },

  /** Filter: a funnel. */
  filter() {
    const g = new THREE.Group();
    cyl(g, 0.14, 0.14, 0.45, "#35b8a6", 0, 0, 0, { metal: 0.3 });
    cyl(g, 0.58, 0.14, 0.66, "#35b8a6", 0, 0.45, 0, { metal: 0.3, side: THREE.DoubleSide }, true);
    torus(g, 0.58, 0.04, "#136b5f", 0, 1.11, 0, [Math.PI / 2, 0, 0]);
    cyl(g, 0.1, 0.1, 0.02, "#0d4a41", 0, 0.46, 0);
    return { group: g };
  },

  /** Decision / condition: an upright amber diamond with a question mark, like the flowchart symbol. */
  decision() {
    const g = new THREE.Group();
    const cy = 0.64;
    const body = box(g, 0.88, 0.88, 0.24, "#f6c24c", 0, cy - 0.44, 0, { r: 0.07, metal: 0.15, rough: 0.4 });
    body.rotation.z = Math.PI / 4;
    const rim = box(g, 0.7, 0.7, 0.02, "#8a5a00", 0, cy - 0.35, 0.121, { r: 0.04, rough: 0.5 });
    rim.rotation.z = Math.PI / 4;
    const face = box(g, 0.64, 0.64, 0.02, "#ffd36b", 0, cy - 0.32, 0.131, { r: 0.035, rough: 0.35 });
    face.rotation.z = Math.PI / 4;
    const tex = decal("?", "#5c3b00", 128, 128);
    if (tex) mesh(g, new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), 0, cy, 0.145);
    return { group: g };
  },

  /** Start / end: a green capsule (the flowchart terminator) with a ring on its face. */
  startend() {
    const g = new THREE.Group();
    const cap = mesh(g, new THREE.CapsuleGeometry(0.38, 0.5, 10, 24), material("#4caf50", { rough: 0.4 }), 0, 0.42, 0);
    cap.rotation.z = Math.PI / 2;
    cap.scale.set(1, 1, 0.66);
    torus(g, 0.17, 0.045, "#ffffff", 0, 0.42, 0.25, [0, 0, 0], Math.PI * 2, { rough: 0.3 });
    ball(g, 0.07, "#ffffff", 0, 0.42, 0.25, { rough: 0.3 });
    return { group: g };
  },

  /** Process / step: a blue box with double side bars (the "predefined process" symbol). */
  process() {
    const g = new THREE.Group();
    box(g, 1.05, 0.7, 0.3, "#5aa2ff", 0, 0.1, 0, { r: 0.06 });
    box(g, 0.05, 0.7, 0.02, "#1d4f9e", -0.37, 0.1, 0.155, { r: 0.008 });
    box(g, 0.05, 0.7, 0.02, "#1d4f9e", 0.37, 0.1, 0.155, { r: 0.008 });
    box(g, 0.5, 0.05, 0.02, "#dbe9ff", 0, 0.52, 0.155, { r: 0.008 });
    box(g, 0.38, 0.05, 0.02, "#dbe9ff", 0, 0.38, 0.155, { r: 0.008 });
    box(g, 0.44, 0.05, 0.02, "#dbe9ff", 0, 0.24, 0.155, { r: 0.008 });
    return { group: g };
  },

  /** Loop / retry: a purple ring that ends in an arrow head, slowly turning. */
  loop() {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    spin.position.set(0, 0.68, 0);
    const R = 0.45, end = Math.PI * 1.62;
    torus(spin, R, 0.085, "#7b5cd6", 0, 0, 0, [0, 0, 0], end, { rough: 0.35 });
    const tip = new THREE.Vector3(R * Math.cos(end), R * Math.sin(end), 0);
    const tangent = new THREE.Vector3(-Math.sin(end), Math.cos(end), 0);
    const cone = mesh(spin, new THREE.ConeGeometry(0.2, 0.3, 20), material("#7b5cd6", { rough: 0.35 }), tip.x, tip.y, 0);
    cone.position.addScaledVector(tangent, 0.12);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    cyl(g, 0.3, 0.34, 0.07, "#4b3a8f", 0, 0, 0);
    g.add(spin);
    return { group: g, tick: (t) => { spin.rotation.z = -t * 0.7; } };
  },

  /** Fork / join: one flow in, a heavy bar, parallel flows out. */
  fork() {
    const g = new THREE.Group();
    box(g, 1.2, 0.22, 0.3, "#3d4350", 0, 0.52, 0, { r: 0.06, metal: 0.3 });
    arrow(g, [0, 1.25, 0], [0, 0.78, 0], 0.065, "#ef7d45", 0.22);
    arrow(g, [-0.4, 0.5, 0], [-0.4, 0.05, 0], 0.065, "#ef7d45", 0.22);
    arrow(g, [0.4, 0.5, 0], [0.4, 0.05, 0], 0.065, "#ef7d45", 0.22);
    return { group: g };
  },

  /** Timer / schedule: a clock with moving hands. */
  timer() {
    const g = new THREE.Group();
    const c = 0.62;
    const face = cyl(g, 0.5, 0.5, 0.16, "#f1f3f6", 0, c - 0.08, 0, { rough: 0.4 });
    face.rotation.x = Math.PI / 2;
    face.position.set(0, c, 0);
    torus(g, 0.5, 0.06, "#4b5a70", 0, c, 0, [0, 0, 0], Math.PI * 2, { metal: 0.3, rough: 0.35 });
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      ball(g, 0.022, "#4b5a70", Math.sin(a) * 0.4, c + Math.cos(a) * 0.4, 0.085);
    }
    cyl(g, 0.07, 0.07, 0.14, "#4b5a70", 0, 1.1, 0);
    const minute = new THREE.Group(), hour = new THREE.Group();
    minute.position.set(0, c, 0.1); hour.position.set(0, c, 0.1);
    between(minute, [0, 0, 0], [0, 0.34, 0], 0.022, "#222831");
    between(hour, [0, 0, 0], [0, 0.22, 0], 0.03, "#222831");
    ball(g, 0.045, "#e05a47", 0, c, 0.11);
    g.add(minute, hour);
    return { group: g, tick: (t) => { minute.rotation.z = -t * 0.9; hour.rotation.z = -t * 0.075 + 1; } };
  },

  /** Event / trigger: a lightning bolt. */
  trigger() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    const pts: [number, number][] = [[0.1, 1.22], [-0.3, 0.58], [-0.04, 0.58], [-0.14, 0.04], [0.32, 0.8], [0.05, 0.8], [0.3, 1.22]];
    s.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
    geo.translate(0, 0, -0.08);
    cyl(g, 0.42, 0.46, 0.04, "#8a5a00", 0, 0, 0);
    mesh(g, geo, material("#f6c24c", { emissive: "#f6a800", ei: 0.3, rough: 0.35 }));
    return { group: g };
  },

  /** HTTP: a browser window. */
  http() {
    const g = new THREE.Group();
    box(g, 1.1, 0.8, 0.24, "#4a90f0", 0, 0.14, 0, { r: 0.06 });
    box(g, 1.0, 0.16, 0.02, "#2c5fa8", 0, 0.76, 0.125, { r: 0.01 });
    [0, 1, 2].forEach((i) => ball(g, 0.032, ["#e05a47", "#f6c24c", "#4caf50"][i], -0.4 + i * 0.09, 0.84, 0.14, { rough: 0.3 }));
    plaque(g, "HTTP", "#ffffff", 0.78, 0, 0.45, 0.132);
    return { group: g };
  },

  /** REST API: a green plate with the curly braces of a JSON payload. */
  rest() {
    const g = new THREE.Group();
    box(g, 1.1, 0.8, 0.24, "#2f9e6e", 0, 0.14, 0, { r: 0.06 });
    box(g, 1.0, 0.06, 0.02, "#1c6b49", 0, 0.82, 0.125, { r: 0.01 });
    plaque(g, "{REST}", "#ffffff", 0.92, 0, 0.5, 0.132, 384);
    return { group: g };
  },

  /** WebSocket: a purple plate with one two-way arrow, because the line stays open both ways. */
  websocket() {
    const g = new THREE.Group();
    box(g, 1.1, 0.9, 0.18, "#7b5cd6", 0, 0.1, -0.04, { r: 0.07 });
    arrow(g, [0, 0.7, 0.1], [0.42, 0.7, 0.1], 0.036, "#ffffff", 0.18);
    arrow(g, [0, 0.7, 0.1], [-0.42, 0.7, 0.1], 0.036, "#ffffff", 0.18);
    plaque(g, "WS", "#ffffff", 0.52, 0, 0.34, 0.056);
    return { group: g };
  },

  /** Server-sent events: an orange plate with a one-way stream of arrows from the server. */
  sse() {
    const g = new THREE.Group();
    box(g, 1.1, 0.9, 0.18, "#ef7d45", 0, 0.1, -0.04, { r: 0.07 });
    arrow(g, [-0.42, 0.86, 0.1], [0.42, 0.86, 0.1], 0.03, "#ffffff", 0.16);
    arrow(g, [-0.42, 0.7, 0.1], [0.2, 0.7, 0.1], 0.03, "#ffffff", 0.16);
    arrow(g, [-0.42, 0.54, 0.1], [0.34, 0.54, 0.1], 0.03, "#ffffff", 0.16);
    plaque(g, "SSE", "#ffffff", 0.6, 0, 0.3, 0.056);
    return { group: g };
  },

  /** Webhook: a hook that catches a call from another system. */
  webhook() {
    const g = new THREE.Group();
    cyl(g, 0.5, 0.5, 0.08, "#8a2250", 0, 0, 0);
    torus(g, 0.25, 0.07, "#d6457a", 0, 0.5, 0, [0, 0, Math.PI], Math.PI, { rough: 0.35 });
    cyl(g, 0.07, 0.07, 0.62, "#d6457a", 0.25, 0.5, 0, { rough: 0.35 });
    ball(g, 0.12, "#d6457a", 0.25, 1.17, 0, { rough: 0.3 });
    ball(g, 0.1, "#f2a0bd", -0.25, 0.5, 0, { rough: 0.3 });
    return { group: g };
  },

  /** Servers: a rack of three units with LEDs. */
  server() {
    const g = new THREE.Group();
    [0, 1, 2].forEach((i) => {
      const y = i * 0.35;
      box(g, 1.04, 0.3, 0.74, "#9aa0a8", 0, y, 0, { r: 0.04, metal: 0.45, rough: 0.35 });
      box(g, 0.5, 0.025, 0.01, "#4b5058", -0.18, y + 0.1, 0.372, { r: 0.004 });
      box(g, 0.5, 0.025, 0.01, "#4b5058", -0.18, y + 0.19, 0.372, { r: 0.004 });
      ball(g, 0.035, "#9bff9b", 0.38, y + 0.15, 0.375, { emissive: "#4cff6a", ei: 1.4 });
    });
    return { group: g };
  },

  /** SaaS apps: four coloured cubes. */
  apps() {
    const g = new THREE.Group();
    ([[-0.27, -0.27, "#e05a47", 0.5], [0.27, -0.27, "#5aa2ff", 0.66], [-0.27, 0.27, "#4caf50", 0.42], [0.27, 0.27, "#f6c24c", 0.58]] as const)
      .forEach(([x, z, c, h]) => box(g, 0.46, h, 0.46, c, x, 0, z, { r: 0.08, rough: 0.4 }));
    return { group: g };
  },

  /** Sandbox: a taped cardboard box. */
  box() {
    const g = new THREE.Group();
    const b = box(g, 0.92, 0.92, 0.92, "#f6c24c", 0, 0, 0, { r: 0.04 });
    box(g, 0.2, 0.935, 0.935, "#d9a53a", 0, 0, 0, { r: 0.02 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry, 30), new THREE.LineBasicMaterial({ color: "#8a5a00" }));
    edges.position.copy(b.position);
    g.add(edges);
    return { group: g };
  },

  /** External site: a spinning globe on a stand. */
  globe() {
    const g = new THREE.Group();
    cyl(g, 0.34, 0.4, 0.07, "#4b5058", 0, 0, 0, { metal: 0.4 });
    cyl(g, 0.04, 0.04, 0.26, "#4b5058", 0, 0.07, 0);
    const spin = new THREE.Group();
    spin.position.y = 0.86;
    spin.rotation.z = 0.4;
    ball(spin, 0.52, "#5aa2ff", 0, 0, 0, { rough: 0.35 });
    torus(spin, 0.525, 0.014, "#1d4f9e", 0, 0, 0, [Math.PI / 2, 0, 0]);
    torus(spin, 0.525, 0.014, "#1d4f9e", 0, 0, 0, [0, 0, 0]);
    torus(spin, 0.525, 0.014, "#1d4f9e", 0, 0, 0, [0, Math.PI / 2, 0]);
    ([[0.2, 0.2, 0.42, 0.22], [-0.3, -0.1, 0.4, 0.18], [0.1, -0.35, 0.36, 0.16], [0.42, -0.1, 0.25, 0.14]] as const).forEach(([a, b, c, s]) => {
      const n = new THREE.Vector3(a, b, c).normalize().multiplyScalar(0.52);
      const m = ball(spin, s, "#4caf50", n.x, n.y, n.z, { rough: 0.7 });
      m.scale.set(1, 1, 0.3);
      m.lookAt(n.clone().multiplyScalar(2));
    });
    g.add(spin);
    return { group: g, tick: (t) => { spin.rotation.y = t * 0.45; } };
  },

  // ---------------------------------------------------------------- AI components

  /** LLM: a chat bubble with a tail, the letters LLM and three thinking dots. */
  llm() {
    const g = new THREE.Group();
    cyl(g, 0.5, 0.52, 0.05, "#2f3796", 0, 0, 0);
    box(g, 1.2, 0.72, 0.3, "#5865f2", 0, 0.4, 0, { r: 0.14 });
    const tail = mesh(g, new THREE.ConeGeometry(0.17, 0.26, 4), material("#5865f2"), -0.34, 0.3, 0);
    tail.rotation.set(Math.PI, Math.PI / 4, 0); // apex points down at the pad
    plaque(g, "LLM", "#ffffff", 0.72, 0, 0.86, 0.156);
    const dots = [-0.17, 0, 0.17].map((x) => ball(g, 0.05, "#ffffff", x, 0.6, 0.16, { emissive: "#dfe3ff", ei: 0.8 }));
    return { group: g, tick: (t) => dots.forEach((d, i) => { d.position.y = 0.6 + Math.max(0, Math.sin(t * 4 - i * 0.9)) * 0.06; }) };
  },

  /** Agent / orchestrator: a friendly robot head with an antenna that pulses. */
  agent() {
    const g = new THREE.Group();
    box(g, 0.7, 0.4, 0.5, "#168a9b", 0, 0.04, 0, { r: 0.08 });
    box(g, 0.94, 0.6, 0.7, "#1fb6c9", 0, 0.46, 0, { r: 0.14 });
    for (const x of [-0.21, 0.21]) {
      ball(g, 0.085, "#ffffff", x, 0.78, 0.35, { emissive: "#c8f7ff", ei: 0.9 });
      ball(g, 0.04, "#0d3d46", x, 0.78, 0.425, { rough: 0.3 });
    }
    box(g, 0.34, 0.05, 0.02, "#0d3d46", 0, 0.58, 0.355, { r: 0.012 });
    for (const x of [-0.54, 0.54]) {
      const ear = cyl(g, 0.11, 0.11, 0.12, "#168a9b", x, 0.62, 0);
      ear.rotation.z = Math.PI / 2;
    }
    between(g, [0, 1.06, 0], [0, 1.28, 0], 0.025, "#0d3d46");
    const tip = ball(g, 0.08, "#ffb020", 0, 1.34, 0, { emissive: "#ff9d00", ei: 0.9 });
    return { group: g, tick: (t) => tip.scale.setScalar(1 + Math.sin(t * 4) * 0.18) };
  },

  /** RAG pipeline: a document with a magnifying glass over it. */
  rag() {
    const g = new THREE.Group();
    cyl(g, 0.62, 0.64, 0.06, "#7a2a8a", 0, 0, 0);
    box(g, 0.64, 0.82, 0.06, "#ffffff", -0.2, 0.08, -0.02, { r: 0.03, rough: 0.7 });
    box(g, 0.64, 0.82, 0.04, "#e9d8f2", -0.14, 0.08, -0.07, { r: 0.03, rough: 0.7 });
    plaque(g, "RAG", "#c13fd6", 0.46, -0.2, 0.72, 0.012);
    [0.5, 0.4, 0.3].forEach((y, i) => box(g, 0.44 - i * 0.08, 0.035, 0.012, "#b9a0c8", -0.26 + (-i * 0.04), y, 0.012, { r: 0.006 }));
    torus(g, 0.25, 0.05, "#c13fd6", 0.2, 0.44, 0.14, [0, 0, 0], Math.PI * 2, { metal: 0.3 });
    cyl(g, 0.24, 0.24, 0.015, "#d9f2ff", 0.2, 0.44, 0.13, { opacity: 0.35, rough: 0.1 }).rotation.x = Math.PI / 2;
    between(g, [0.38, 0.26, 0.14], [0.58, 0.08, 0.14], 0.06, "#8a2a9c");
    return { group: g };
  },

  /** Embedding model: three axes of a vector space with a few points floating in it. */
  embed() {
    const g = new THREE.Group();
    cyl(g, 0.62, 0.64, 0.05, "#8a5200", 0, 0, 0);
    const o: V3 = [-0.3, 0.1, 0.22];
    arrow(g, o, [0.5, 0.1, 0.22], 0.022, "#c77a12", 0.15);
    arrow(g, o, [-0.3, 1.0, 0.22], 0.022, "#c77a12", 0.15);
    arrow(g, o, [-0.3, 0.1, -0.5], 0.022, "#c77a12", 0.15);
    const pts: V3[] = [[0.12, 0.62, 0.02], [0.28, 0.45, 0.14], [-0.02, 0.85, -0.06], [0.18, 0.78, 0.1]];
    const balls = pts.map((p) => {
      between(g, o, p, 0.008, "#e3b25c");
      return ball(g, 0.065, "#fbbf24", p[0], p[1], p[2], { emissive: "#ffb000", ei: 0.6 });
    });
    return { group: g, tick: (t) => balls.forEach((b, i) => { b.position.y = pts[i][1] + Math.sin(t * 1.7 + i * 1.5) * 0.035; }) };
  },

  /** Retriever / reranker: ranked bars, tallest first, with a crown on the best match. */
  retriever() {
    const g = new THREE.Group();
    box(g, 1.3, 0.1, 0.56, "#9c2543", 0, 0, 0, { r: 0.04 });
    [0.9, 0.68, 0.48, 0.32].forEach((h, i) => box(g, 0.24, h, 0.34, ["#f43f5e", "#f2627a", "#f48ca0", "#f7b3c0"][i], -0.43 + i * 0.29, 0.1, -0.02, { r: 0.04 }));
    const star = ball(g, 0.075, "#ffd24d", -0.43, 1.12, -0.02, { emissive: "#ffb800", ei: 0.9 });
    plaque(g, "TOP-K", "#ffffff", 0.5, 0.18, 0.05, 0.285);
    return { group: g, tick: (t) => { star.position.y = 1.12 + Math.sin(t * 2.4) * 0.04; } };
  },

  /** Prompt / template: a card with a header, text lines and a blinking cursor. */
  prompt() {
    const g = new THREE.Group();
    cyl(g, 0.5, 0.52, 0.05, "#0d6b4d", 0, 0, 0);
    box(g, 1.04, 0.86, 0.12, "#20b486", 0, 0.1, 0, { r: 0.06 });
    box(g, 0.94, 0.14, 0.02, "#0f7f5c", 0, 0.82, 0.065, { r: 0.01 });
    plaque(g, "PROMPT", "#ffffff", 0.78, 0, 0.6, 0.066);
    box(g, 0.74, 0.04, 0.012, "#d8fff0", -0.04, 0.4, 0.066, { r: 0.006 });
    box(g, 0.5, 0.04, 0.012, "#d8fff0", -0.16, 0.3, 0.066, { r: 0.006 });
    const cursor = box(g, 0.07, 0.11, 0.012, "#ffffff", 0.14, 0.2, 0.066, { r: 0.006, emissive: "#ffffff", ei: 0.8 });
    return { group: g, tick: (t) => { cursor.visible = Math.sin(t * 5) > -0.2; } };
  },

  /** Guardrails: a shield with a check mark. */
  guard() {
    const g = new THREE.Group();
    cyl(g, 0.5, 0.52, 0.05, "#1c3f8f", 0, 0, 0);
    const s = new THREE.Shape();
    s.moveTo(0, 1.28);
    s.lineTo(0.5, 1.12);
    s.lineTo(0.5, 0.7);
    s.quadraticCurveTo(0.46, 0.3, 0, 0.1);
    s.quadraticCurveTo(-0.46, 0.3, -0.5, 0.7);
    s.lineTo(-0.5, 1.12);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    geo.translate(0, 0, -0.07);
    mesh(g, geo, material("#3a6fd8", { rough: 0.35, metal: 0.15 }));
    between(g, [-0.2, 0.68, 0.105], [-0.06, 0.52, 0.105], 0.05, "#ffffff", { emissive: "#dbe6ff", ei: 0.6 });
    between(g, [-0.06, 0.52, 0.105], [0.22, 0.88, 0.105], 0.05, "#ffffff", { emissive: "#dbe6ff", ei: 0.6 });
    return { group: g };
  },

  /** Tool / function call: a wrench with a bolt. */
  tools() {
    const g = new THREE.Group();
    cyl(g, 0.62, 0.64, 0.05, "#475569", 0, 0, 0);
    const w = new THREE.Group();
    box(w, 0.2, 0.8, 0.14, "#94a3b8", 0, 0.05, 0, { r: 0.07, metal: 0.7, rough: 0.35 });
    const head = torus(w, 0.2, 0.09, "#94a3b8", 0, 0.98, 0, [0, 0, 2.27], Math.PI * 2 - 1.4, { metal: 0.7, rough: 0.35 });
    head.scale.z = 1.4; // thicker than the shaft so it reads as a solid jaw
    w.position.set(-0.16, 0.06, 0);
    w.rotation.z = 0.4;
    g.add(w);
    const bolt = mesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.16, 6), material("#f59e0b", { metal: 0.5, rough: 0.35 }), 0.42, 0.26, 0.1);
    bolt.rotation.x = Math.PI / 2;
    return { group: g, tick: (t) => { bolt.rotation.y = t * 0.8; } };
  },

  /** Agent memory: a memory module in its slot, with a thought bubble trail rising from it. */
  memory() {
    const g = new THREE.Group();
    box(g, 1.4, 0.14, 0.26, "#2b2f38", 0, 0, 0, { r: 0.04 });
    box(g, 1.3, 0.56, 0.1, "#1f9d6a", 0, 0.14, 0, { r: 0.03 });
    [-0.45, -0.15, 0.15, 0.45].forEach((x) => box(g, 0.24, 0.28, 0.04, "#1b1f27", x, 0.3, 0.06, { r: 0.015 }));
    for (let i = -6; i <= 6; i++) box(g, 0.06, 0.09, 0.11, "#e6c04a", i * 0.095, 0.06, 0, { r: 0.008, metal: 0.8, rough: 0.3 });
    const dots = ([[0.22, 0.95, 0.065], [0.36, 1.12, 0.09], [0.52, 1.3, 0.12]] as const).map(([x, y, r]) => ball(g, r, "#9bf0c9", x, y, 0, { emissive: "#4be3a2", ei: 0.5 }));
    return { group: g, tick: (t) => dots.forEach((d, i) => d.scale.setScalar(1 + Math.sin(t * 2.4 - i * 0.7) * 0.12)) };
  },

  /** MCP server: a server box with a plug connecting in from above. */
  mcp() {
    const g = new THREE.Group();
    box(g, 0.96, 0.7, 0.7, "#475569", 0, 0.05, 0, { r: 0.08 });
    plaque(g, "MCP", "#ffffff", 0.6, 0, 0.36, 0.352);
    [-0.3, -0.18].forEach((x, i) => ball(g, 0.035, i ? "#38bdf8" : "#7dff9a", x, 0.62, 0.355, { emissive: i ? "#38bdf8" : "#7dff9a", ei: 1.2 }));
    cyl(g, 0.06, 0.06, 0.1, "#1e293b", 0, 0.75, 0);
    const plug = box(g, 0.5, 0.28, 0.3, "#334155", 0, 0.85, 0, { r: 0.06 });
    for (const x of [-0.12, 0.12]) box(g, 0.07, 0.22, 0.05, "#e6c04a", x, 1.13, 0, { r: 0.01, metal: 0.8, rough: 0.3 });
    return { group: g, tick: (t) => { plug.position.y = 0.99 + Math.max(0, Math.sin(t * 2.2)) * 0.03; } };
  },

  // ---------------------------------------------------------------- cloud components

  /** Function / serverless: an orange chip card with a lambda and a spark. */
  lambda() {
    const g = new THREE.Group();
    cyl(g, 0.55, 0.57, 0.05, "#a23d06", 0, 0, 0);
    box(g, 1.0, 0.96, 0.2, "#f2681c", 0, 0.08, 0, { r: 0.08 });
    plaque(g, "λ", "#ffffff", 0.78, 0, 0.58, 0.106, 128);
    for (let i = -3; i <= 3; i++) box(g, 0.07, 0.1, 0.07, "#e6c04a", i * 0.125, 0.0, 0, { r: 0.01, metal: 0.8, rough: 0.3 });
    const spark = ball(g, 0.07, "#ffe08a", 0.36, 0.98, 0.12, { emissive: "#ffb000", ei: 1 });
    return { group: g, tick: (t) => spark.scale.setScalar(0.8 + Math.max(0, Math.sin(t * 5)) * 0.6) };
  },

  /** Container: a shipping container with ridged sides and a door. */
  container() {
    const g = new THREE.Group();
    box(g, 1.3, 0.62, 0.66, "#1f6fd6", 0, 0.04, 0, { r: 0.04 });
    for (let i = -5; i <= 5; i++) box(g, 0.035, 0.52, 0.02, "#1757a8", i * 0.11, 0.09, 0.335, { r: 0.006 });
    box(g, 1.34, 0.04, 0.7, "#164a8f", 0, 0.66, 0, { r: 0.02 });
    box(g, 0.03, 0.5, 0.025, "#0e2f5c", 0.6, 0.1, 0.34, { r: 0.005 });
    const hatch = box(g, 0.26, 0.26, 0.26, "#f6c24c", 0.35, 0.7, 0, { r: 0.03 });
    return { group: g, tick: (t) => { hatch.position.y = 0.83 + Math.sin(t * 1.6) * 0.03; } };
  },

  /** Cluster / Kubernetes: a blue seven sided badge with a ship's wheel. */
  cluster() {
    const g = new THREE.Group();
    cyl(g, 0.55, 0.57, 0.05, "#1a3d91", 0, 0, 0);
    const badge = mesh(g, new THREE.CylinderGeometry(0.58, 0.58, 0.18, 7), material("#326ce5", { rough: 0.4 }), 0, 0.72, 0);
    badge.rotation.x = Math.PI / 2;
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.72, 0.11);
    torus(wheel, 0.28, 0.035, "#ffffff", 0, 0, 0);
    ball(wheel, 0.08, "#ffffff", 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      between(wheel, [0, 0, 0], [Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0], 0.028, "#ffffff");
      ball(wheel, 0.045, "#ffffff", Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0);
    }
    g.add(wheel);
    return { group: g, tick: (t) => { wheel.rotation.z = t * 0.5; } };
  },

  /** DNS / domain: a signpost with three pointing signs. */
  dns() {
    const g = new THREE.Group();
    cyl(g, 0.4, 0.44, 0.06, "#3a4452", 0, 0, 0);
    cyl(g, 0.05, 0.05, 1.25, "#8b6b4a", 0, 0.06, 0);
    const signs: [string, number, number, string, string][] = [["#2fa37a", 1.0, 0.1, "www", "#ffffff"], ["#e0a526", 0.78, -0.12, ".com", "#3a2a00"], ["#5b6cf0", 0.56, 0.08, "DNS", "#ffffff"]];
    signs.forEach(([c, y, rot, text, tc]) => {
      const s = new THREE.Group();
      box(s, 0.78, 0.2, 0.05, c, 0, 0, 0, { r: 0.03 });
      const tip = mesh(s, new THREE.ConeGeometry(0.1, 0.14, 3), material(c), 0.45, 0.1, 0);
      tip.rotation.z = -Math.PI / 2;
      plaque(s, text, tc, 0.4, -0.04, 0.1, 0.028);
      s.position.set(0.0, y, 0.06);
      s.rotation.y = rot;
      g.add(s);
    });
    return { group: g };
  },

  /** Data warehouse: a depot building with a roof, a rolling door and crates. */
  warehouse() {
    const g = new THREE.Group();
    box(g, 1.2, 0.56, 0.9, "#8794a6", 0, 0, 0, { r: 0.04 });
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.66, 0); roofShape.lineTo(0, 0.34); roofShape.lineTo(0.66, 0); roofShape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 0.98, bevelEnabled: false });
    roofGeo.translate(0, 0, -0.49);
    mesh(g, roofGeo, material("#d9534f"), 0, 0.56, 0);
    box(g, 0.52, 0.42, 0.04, "#cfd6de", 0, 0, 0.45, { r: 0.01 });
    for (let i = 0; i < 5; i++) box(g, 0.5, 0.012, 0.012, "#8794a6", 0, 0.07 + i * 0.075, 0.475, { r: 0.002 });
    box(g, 0.26, 0.2, 0.26, "#e0a526", -0.46, 0, 0.62, { r: 0.02 });
    const top = box(g, 0.22, 0.17, 0.22, "#f0b232", -0.46, 0.2, 0.62, { r: 0.02 });
    plaque(g, "DW", "#ffffff", 0.3, 0.42, 0.38, 0.452);
    return { group: g, tick: (t) => { top.rotation.y = Math.sin(t) * 0.2; } };
  },

  /** Monitoring / alarm: a beacon light with a turning lamp inside a red dome. */
  alarm() {
    const g = new THREE.Group();
    cyl(g, 0.5, 0.54, 0.14, "#3a4452", 0, 0, 0);
    cyl(g, 0.4, 0.46, 0.14, "#59616f", 0, 0.14, 0);
    const dome = mesh(g, new THREE.SphereGeometry(0.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), material("#ff4d4d", { opacity: 0.62, rough: 0.15 }), 0, 0.28, 0);
    dome.renderOrder = 2;
    const lamp = new THREE.Group();
    lamp.position.y = 0.5;
    ball(lamp, 0.1, "#fff3b0", 0, 0, 0, { emissive: "#ffd000", ei: 1.4 });
    box(lamp, 0.62, 0.04, 0.05, "#fff3b0", 0, 0, 0, { emissive: "#ffe27a", ei: 1 });
    g.add(lamp);
    for (const x of [-0.62, 0.62]) between(g, [x * 0.9, 0.55, 0], [x * 1.1, 0.7, 0], 0.025, "#ff9d9d");
    return { group: g, tick: (t) => { lamp.rotation.y = t * 4; } };
  },

  /** Key / secrets: a gold key with a round head and teeth, leaning on a pad. */
  key() {
    const g = new THREE.Group();
    cyl(g, 0.55, 0.57, 0.05, "#7a5a00", 0, 0, 0);
    const k = new THREE.Group();
    torus(k, 0.25, 0.09, "#f2c230", 0, 0, 0, [0, 0, 0], Math.PI * 2, { metal: 0.6, rough: 0.3 });
    ball(k, 0.07, "#7a5a00", 0, 0, 0.05);
    box(k, 0.13, 0.7, 0.14, "#f2c230", 0, -0.6, 0, { r: 0.04, metal: 0.6, rough: 0.3 });
    for (const [y, w] of [[-0.72, 0.26], [-0.88, 0.2]] as const) box(k, w, 0.11, 0.14, "#f2c230", w / 2 + 0.03, y, 0, { r: 0.03, metal: 0.6, rough: 0.3 });
    k.position.set(0, 1.12, 0);
    k.rotation.z = 0.35;
    g.add(k);
    return { group: g, tick: (t) => { k.rotation.y = Math.sin(t * 0.9) * 0.5; } };
  },

  /** Identity / IAM: an ID badge with a portrait and text lines. */
  identity() {
    const g = new THREE.Group();
    cyl(g, 0.55, 0.57, 0.05, "#3b3f99", 0, 0, 0);
    box(g, 0.92, 1.18, 0.12, "#6366f1", 0, 0.1, 0, { r: 0.07 });
    box(g, 0.3, 0.05, 0.03, "#1f2160", 0, 1.17, 0.07, { r: 0.02 });
    ball(g, 0.16, "#f5d0b0", 0, 0.88, 0.1);
    const body = ball(g, 0.3, "#e0e7ff", 0, 0.5, 0.08);
    body.scale.set(1, 0.7, 0.3);
    box(g, 0.62, 0.04, 0.012, "#e0e7ff", 0, 0.34, 0.066, { r: 0.006 });
    box(g, 0.44, 0.04, 0.012, "#c7d2fe", -0.09, 0.24, 0.066, { r: 0.006 });
    const tick = box(g, 0.16, 0.16, 0.02, "#34d399", 0.3, 0.97, 0.066, { r: 0.03, emissive: "#34d399", ei: 0.6 });
    return { group: g, tick: (t) => tick.scale.setScalar(1 + Math.sin(t * 3) * 0.1) };
  },

  /** Firewall / WAF: a brick wall with a flame on top. */
  firewall() {
    const g = new THREE.Group();
    const cols = ["#c0462c", "#d2573a", "#b83d25"];
    for (let r = 0; r < 4; r++) {
      const n = r % 2 === 0 ? 4 : 3;
      const off = r % 2 === 0 ? 0 : 0.16;
      for (let i = 0; i < n; i++) box(g, 0.32, 0.17, 0.4, cols[(i + r) % 3], -0.48 + off + i * 0.32 + (r % 2 === 0 ? 0 : 0.16), r * 0.18, 0, { r: 0.02 });
    }
    box(g, 1.3, 0.05, 0.44, "#7a2a18", 0, 0.72, 0, { r: 0.02 });
    const flames = [[-0.2, 0.34], [0.05, 0.5], [0.3, 0.3]].map(([x, h], i) => {
      const f = mesh(g, new THREE.ConeGeometry(0.14, h, 12), material(i === 1 ? "#ffb020" : "#ff7a1a", { emissive: "#ff5a00", ei: 0.9 }), x, 0.77 + h / 2, 0);
      return { f, h, i };
    });
    return { group: g, tick: (t) => flames.forEach(({ f, h, i }) => { f.scale.y = 1 + Math.sin(t * 7 + i * 2) * 0.16; f.position.y = 0.77 + (h * f.scale.y) / 2; }) };
  },

  /** Virtual network: a hub joined to four nodes. */
  network() {
    const g = new THREE.Group();
    cyl(g, 0.64, 0.66, 0.05, "#115e59", 0, 0, 0);
    const hub = ball(g, 0.24, "#14b8a6", 0, 0.5, 0, { rough: 0.3 });
    const outer: THREE.Mesh[] = [];
    ([[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]] as const).forEach(([x, z], i) => {
      between(g, [0, 0.5, 0], [x, 0.3 + i * 0.08, z], 0.03, "#5eead4");
      outer.push(ball(g, 0.14, "#2dd4bf", x, 0.3 + i * 0.08, z, { emissive: "#0d9488", ei: 0.4 }));
    });
    torus(g, 0.5, 0.01, "#99f6e4", 0, 0.52, 0, [Math.PI / 2, 0, 0]);
    return { group: g, tick: (t) => { hub.scale.setScalar(1 + Math.sin(t * 2) * 0.06); outer.forEach((o, i) => o.scale.setScalar(1 + Math.max(0, Math.sin(t * 2.6 - i * 1.2)) * 0.25)); } };
  },

  /** Data pipeline / ETL: a conveyor carrying crates through a processing gate. */
  etl() {
    const g = new THREE.Group();
    box(g, 1.34, 0.14, 0.5, "#3b3f4a", 0, 0.1, 0, { r: 0.05 });
    for (const x of [-0.62, 0.62]) { const r = cyl(g, 0.1, 0.1, 0.52, "#6b7280", x, 0.1, 0, { metal: 0.4 }); r.rotation.x = Math.PI / 2; r.position.y = 0.17; }
    for (const x of [-0.5, 0.5]) box(g, 0.1, 0.1, 0.4, "#1f2937", x, 0, 0, { r: 0.02 });
    box(g, 0.08, 0.7, 0.08, "#8b5cf6", -0.07, 0.22, 0.28, { r: 0.02 });
    box(g, 0.08, 0.7, 0.08, "#8b5cf6", -0.07, 0.22, -0.28, { r: 0.02 });
    box(g, 0.14, 0.12, 0.64, "#a78bfa", -0.07, 0.88, 0, { r: 0.03 });
    const lamp = ball(g, 0.06, "#c4b5fd", -0.07, 0.98, 0, { emissive: "#a78bfa", ei: 1 });
    const crates = [0, 1, 2].map((i) => box(g, 0.24, 0.24, 0.26, i === 1 ? "#34d399" : "#60a5fa", 0, 0.24, 0, { r: 0.03 }));
    return {
      group: g,
      tick: (t) => {
        crates.forEach((c, i) => {
          const p = (((t * 0.22 + i / 3) % 1) + 1) % 1; // 0..1 along the belt
          c.position.x = -0.6 + p * 1.2;
          const through = p > 0.42 && p < 0.58; // inside the gate the crate is "being processed"
          c.rotation.y = through ? t * 6 : 0;
        });
        lamp.scale.setScalar(1 + Math.sin(t * 5) * 0.2);
      },
    };
  },

  /** IoT device: a small circuit board with a chip and an antenna sending out waves. */
  iot() {
    const g = new THREE.Group();
    box(g, 1.1, 0.1, 0.8, "#15803d", 0, 0, 0, { r: 0.03 });
    box(g, 0.44, 0.16, 0.44, "#1f2937", -0.12, 0.1, 0.02, { r: 0.03 });
    for (const x of [-0.4, 0.5]) box(g, 0.14, 0.1, 0.14, "#e6c04a", x, 0.1, 0.25, { r: 0.015, metal: 0.7 });
    for (const x of [-0.3, 0.3]) box(g, 0.05, 0.02, 0.22, "#86efac", -0.1 + x * 0.3, 0.1, -0.25, { r: 0.005 });
    cyl(g, 0.03, 0.03, 0.55, "#374151", 0.38, 0.1, -0.2);
    ball(g, 0.06, "#ef4444", 0.38, 0.68, -0.2, { emissive: "#ef4444", ei: 0.9 });
    const arcs = [0.2, 0.34, 0.48].map((r) => {
      const a = torus(g, r, 0.016, "#38bdf8", 0.38, 0.68, -0.2, [0, 0, Math.PI / 2 - 0.9], 1.8, { emissive: "#38bdf8", ei: 0.7 });
      return a;
    });
    return { group: g, tick: (t) => arcs.forEach((a, i) => { a.visible = Math.sin(t * 3 - i * 0.9) > -0.3; }) };
  },

  /** Archive / backup: a two drawer filing cabinet, the top drawer slides open now and then. */
  archive() {
    const g = new THREE.Group();
    box(g, 0.9, 1.1, 0.64, "#64748b", 0, 0, 0, { r: 0.05 });
    const drawers = [0, 1].map((i) => {
      const d = new THREE.Group();
      box(d, 0.8, 0.46, 0.04, "#8b9bb0", 0, 0, 0, { r: 0.03 });
      box(d, 0.3, 0.05, 0.05, "#e2e8f0", 0, 0.2, 0.04, { r: 0.015, metal: 0.6 });
      box(d, 0.22, 0.1, 0.012, "#f8fafc", 0, 0.08, 0.025, { r: 0.004 });
      d.position.set(0, 0.07 + i * 0.52, 0.33);
      g.add(d);
      return d;
    });
    box(g, 0.94, 0.05, 0.68, "#475569", 0, 1.1, 0, { r: 0.02 });
    return { group: g, tick: (t) => { drawers[1].position.z = 0.33 + Math.max(0, Math.sin(t * 1.1)) * 0.22; } };
  },

  /** File storage: a manila folder with papers sticking out. */
  files() {
    const g = new THREE.Group();
    box(g, 1.2, 0.84, 0.1, "#d99512", 0, 0, -0.14, { r: 0.04 });
    box(g, 0.5, 0.1, 0.1, "#d99512", -0.32, 0.84, -0.14, { r: 0.04 });
    const sheets = [0, 1, 2].map((i) => box(g, 1.0, 0.74, 0.02, "#ffffff", 0, 0.08 + i * 0.03, -0.05 + i * 0.03, { r: 0.01, rough: 0.8 }));
    box(g, 1.2, 0.62, 0.1, "#f6b21c", 0, 0, 0.16, { r: 0.04 });
    plaque(g, "FILES", "#7a4b00", 0.7, 0, 0.3, 0.215);
    return { group: g, tick: (t) => sheets.forEach((s, i) => { s.position.y = 0.34 + i * 0.03 + Math.sin(t * 1.5 + i) * 0.015; }) };
  },
};

/**
 * Build a fresh 3D glyph. Each call owns its geometry and materials: call disposeGlyph() when done.
 * The front of the model faces local +z. Callers turn it with `group.rotation.y = viewAzimuth` so it
 * faces the viewer (thin models such as a phone or a card would otherwise go edge-on when the board
 * is rotated).
 */
export function createGlyph(icon: IconKey): Glyph3D {
  const built = BUILD[icon]();
  const root = new THREE.Group();
  root.add(built.group);
  return { group: root, tick: built.tick };
}

export function disposeGlyph(glyph: Glyph3D): void {
  glyph.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = (m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []) as THREE.Material[];
    for (const mat of mats) {
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
  glyph.group.removeFromParent();
}
