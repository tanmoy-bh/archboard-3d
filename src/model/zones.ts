import type { DocData, ZoneData } from "./types";

/** A tile whose centre is within this many cells of a zone counts as part of it, so a gateway can sit on the border. */
export const ZONE_BORDER = 0.5;

export const zoneArea = (z: ZoneData): number => z.w * z.h;

/** Is the point (gx, gy) inside the zone, grown by `tol` cells on every side? */
export function zoneContains(z: ZoneData, gx: number, gy: number, tol = 0): boolean {
  return gx >= z.gx - tol && gx <= z.gx + z.w + tol && gy >= z.gy - tol && gy <= z.gy + z.h + tol;
}

/** Does zone `outer` completely contain zone `inner`, and is it strictly bigger? */
export function zoneEncloses(outer: ZoneData, inner: ZoneData): boolean {
  return (
    outer.id !== inner.id &&
    inner.gx >= outer.gx && inner.gy >= outer.gy &&
    inner.gx + inner.w <= outer.gx + outer.w && inner.gy + inner.h <= outer.gy + outer.h &&
    zoneArea(inner) < zoneArea(outer)
  );
}

export interface ZoneMembers { nodes: string[]; texts: string[]; zones: string[] }

/**
 * What moves with a zone: tiles whose centre is inside it (border included, see ZONE_BORDER), text boxes
 * whose centre is inside it, and zones that lie fully inside it. Worked out from positions every time,
 * never stored, so there is nothing to keep in sync.
 */
export function zoneMembers(doc: DocData, zoneId: string): ZoneMembers {
  const z = doc.zones.find((x) => x.id === zoneId);
  if (!z) return { nodes: [], texts: [], zones: [] };
  return {
    nodes: doc.nodes.filter((n) => zoneContains(z, n.gx, n.gy, ZONE_BORDER)).map((n) => n.id),
    texts: doc.texts.filter((t) => zoneContains(z, t.gx, t.gy)).map((t) => t.id),
    zones: doc.zones.filter((o) => zoneEncloses(z, o)).map((o) => o.id),
  };
}

/** Zones biggest first, so smaller (nested) zones are drawn and picked on top. */
export const zonesBigFirst = (zones: ZoneData[]): ZoneData[] => [...zones].sort((a, b) => zoneArea(b) - zoneArea(a));
