import { BRAND_KEYS, BrandKey, isBrandKey } from "./brandKeys";

/** The drawn-for-this-app components. Tools with a real logo are listed in brandKeys.ts. */
export const GENERIC_KEYS = [
  "svc", "redis", "db", "es", "vector", "queue", "cdn", "phone", "laptop", "person",
  "gateway", "blob", "card", "bell", "mail", "sms", "ai", "doc", "graph", "lock",
  "chart", "ring", "filter", "server", "apps", "box", "globe", "decision",
  "startend", "process", "loop", "fork", "timer", "trigger",
  "http", "rest", "websocket", "sse", "webhook",
  "llm", "agent", "rag", "embed", "retriever", "prompt", "guard", "tools", "memory", "mcp",
  "lambda", "container", "cluster", "dns", "warehouse", "alarm", "key", "identity", "firewall", "network", "etl", "iot", "archive", "files",
  "apigw", "auth",
] as const;

export type GenericKey = (typeof GENERIC_KEYS)[number];

/** Glyph keys. These are the icon vocabulary of the "architecture board" style. */
export const ICON_KEYS = [...GENERIC_KEYS, ...BRAND_KEYS] as const;

export type IconKey = (typeof ICON_KEYS)[number];

export function isIconKey(v: unknown): v is IconKey {
  return typeof v === "string" && (ICON_KEYS as readonly string[]).includes(v);
}

export interface NodeData {
  id: string;
  /** Column and row in grid cells. Snapped to quarter cells. */
  gx: number;
  gy: number;
  icon: IconKey;
  label: string;
  /** More tool logos shown in the same box, when it names several tools. Only next to a tool logo. */
  also?: BrandKey[];
}

export const ALSO_MAX = 5;

/** The extra logos a box may keep: tool logos only, no repeats, and none next to a generic component. */
export function cleanAlso(icon: IconKey, also: unknown): BrandKey[] {
  if (!isBrandKey(icon) || !Array.isArray(also)) return [];
  return [...new Set(also.filter(isBrandKey))].filter((k) => k !== icon).slice(0, ALSO_MAX);
}

/** Every icon a box shows, the main one first. */
export function iconKeysOf(node: { icon: IconKey; also?: BrandKey[] }): IconKey[] {
  return [node.icon, ...(node.also ?? [])];
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
  /** Arrow heads at both ends: a two way link. */
  both?: boolean;
}

export const TEXT_SIZES = ["s", "m", "l"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_SIZE_NAMES: Record<TextSize, string> = { s: "Small", m: "Medium", l: "Large" };
export const TEXT_MAX_LENGTH = 2000;

export function isTextSize(v: unknown): v is TextSize {
  return typeof v === "string" && (TEXT_SIZES as readonly string[]).includes(v);
}

/** A free text box for captions and labels. It is not a component, so arrows never connect to it. */
export interface TextData {
  id: string;
  /** Position of the centre, in grid cells. Snapped to half cells. */
  gx: number;
  gy: number;
  /** May contain line breaks. */
  text: string;
  size: TextSize;
  /** Draw a bordered box around the text. */
  boxed?: boolean;
}

/** Swatches offered for zones. Any #rrggbb colour is allowed, these are the quick picks. */
export const ZONE_COLORS = ["#4f8cff", "#3fb67a", "#e0a526", "#e5534b", "#9b7cf0", "#2bb5a8", "#e0609a", "#8a93a3"] as const;
export const ZONE_LABEL_MAX = 80;
/** A zone is at least this many cells on each side. */
export const ZONE_MIN = 1;

export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/**
 * A zone marks a group of components (a layer, a boundary, a team): a tinted rounded area on the floor
 * below tiles and arrows. Which components belong to it is worked out from positions, see model/zones.ts.
 */
export interface ZoneData {
  id: string;
  /** Top left corner in grid cells, in the same units as a tile centre. Snapped to half cells. */
  gx: number;
  gy: number;
  /** Size in cells, at least ZONE_MIN. Snapped to half cells. */
  w: number;
  h: number;
  label: string;
  /** #rrggbb */
  color: string;
}

export interface DocData {
  version: 1;
  title: string;
  nodes: NodeData[];
  edges: EdgeData[];
  /** Free text boxes. Older files have none. */
  texts: TextData[];
  /** Tinted areas that group components. Older files have none. */
  zones: ZoneData[];
  /** Written step list. Badge N on an arrow refers to steps[N - 1]. */
  steps: string[];
  /** Long written explanation, see model/notes.ts for its markup. Left out when there is none. */
  notes?: string;
  /** Id of this board in the saved list on the server. Set by Save so a later Save updates the same one. Older files called it shareId. */
  boardId?: string;
}

export const isBoardId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{8,32}$/.test(v);

export const NOTES_MAX = 20000;
export const GRID_SNAP = 0.5;
/** Tiles snap finer than zones and text, so components can sit close together. */
export const NODE_SNAP = 0.25;
/** Two nodes overlap when they are closer than this on both axes (in cells). */
export const NODE_MIN_GAP = 0.5;

export function emptyDoc(): DocData {
  return { version: 1, title: "Untitled architecture", nodes: [], edges: [], texts: [], zones: [], steps: [] };
}

export const snap = (v: number): number => Math.round(v / GRID_SNAP) * GRID_SNAP;
/** Snap a tile position to quarter cells. */
export const snapNode = (v: number): number => Math.round(v / NODE_SNAP) * NODE_SNAP;

export function genId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 8);
}
