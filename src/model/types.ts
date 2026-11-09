/** Glyph keys. These are the icon vocabulary of the "architecture board" style. */
export const ICON_KEYS = [
  "svc", "redis", "db", "es", "vector", "queue", "cdn", "phone", "laptop", "person",
  "gateway", "blob", "card", "bell", "mail", "sms", "ai", "doc", "graph", "lock",
  "chart", "ring", "filter", "server", "apps", "box", "globe",
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

export function isIconKey(v: unknown): v is IconKey {
  return typeof v === "string" && (ICON_KEYS as readonly string[]).includes(v);
}

export interface NodeData {
  id: string;
  /** Column and row in grid cells. Snapped to half cells. */
  gx: number;
  gy: number;
  icon: IconKey;
  label: string;
}

export interface EdgeData {
  id: string;
  from: string;
  to: string;
  /** Short label (2 to 4 words) saying what moves along the arrow. */
  label?: string;
  /** Step badge number that ties the arrow to the written step list. */
  step?: number;
  /** Key path, drawn in the accent colour. */
  hot?: boolean;
  /** Dashed line: async, error or reply paths. */
  dash?: boolean;
}

export interface DocData {
  version: 1;
  title: string;
  nodes: NodeData[];
  edges: EdgeData[];
  /** Written step list. Badge N on an arrow refers to steps[N - 1]. */
  steps: string[];
}

export const GRID_SNAP = 0.5;
/** Two nodes overlap when they are closer than this on both axes (in cells). */
export const NODE_MIN_GAP = 0.75;

export function emptyDoc(): DocData {
  return { version: 1, title: "Untitled architecture", nodes: [], edges: [], steps: [] };
}

export const snap = (v: number): number => Math.round(v / GRID_SNAP) * GRID_SNAP;

export function genId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 8);
}
