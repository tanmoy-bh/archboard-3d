import { describe, expect, it } from "vitest";
import { parseDoc, stringifyDoc } from "../src/model/serialize";
import { Store } from "../src/model/store";
import { ZONE_COLORS, emptyDoc } from "../src/model/types";
import { ZONE_BORDER, zoneContains, zoneEncloses, zoneMembers, zonesBigFirst } from "../src/model/zones";

function board() {
  const s = new Store(emptyDoc());
  const zone = s.addZone(0, 0, 4, 3, "BFF layer");
  const inside = s.addNode("svc", 2, 1.5, "Orders");
  const border = s.addNode("gateway", -0.5, 1.5, "Gateway"); // on the left border, the entry point
  const justOut = s.addNode("db", -1.25, 1.5, "Far");
  const below = s.addNode("db", 2, 4, "Below");
  const text = s.addText(1, 1, "note");
  const outsideText = s.addText(9, 9, "away");
  return { s, zone, inside, border, justOut, below, text, outsideText };
}

describe("zones: model", () => {
  it("adds a zone with a minimum size, snapped, and selects it", () => {
    const s = new Store(emptyDoc());
    const id = s.addZone(0.2, 0.7, 0.1, 0.1, "Tiny");
    const z = s.zone(id)!;
    expect(z.gx).toBe(0); expect(z.gy).toBe(0.5);
    expect(z.w).toBe(1); expect(z.h).toBe(1);
    expect(ZONE_COLORS).toContain(z.color);
    expect([...s.selection]).toEqual([id]);
  });

  it("saves and reopens zones, and old files without zones still open", () => {
    const s = new Store(emptyDoc());
    s.addZone(1, 2, 5, 3, "Middleware", "#AABBCC");
    const back = parseDoc(stringifyDoc(s.doc));
    expect(back.zones).toEqual([{ id: s.doc.zones[0].id, gx: 1, gy: 2, w: 5, h: 3, label: "Middleware", color: "#aabbcc" }]);
    const old = JSON.stringify({ version: 1, title: "old", nodes: [], edges: [], steps: [] });
    expect(parseDoc(old).zones).toEqual([]);
  });

  it("repairs bad zones when opening a file", () => {
    const text = JSON.stringify({
      version: 1, nodes: [],
      zones: [{ id: "a", gx: 0, gy: 0, w: 0, h: -3, label: 5, color: "red" }, { gx: "x", gy: 0, w: 2, h: 2 }, "nope"],
    });
    const z = parseDoc(text).zones;
    expect(z).toHaveLength(1);
    expect(z[0].w).toBe(1); expect(z[0].h).toBe(1);
    expect(z[0].label).toBe("");
    expect(z[0].color).toBe(ZONE_COLORS[0]);
  });

  it("counts zones as items, selects them with select all, and clears them", () => {
    const { s } = board();
    expect(s.itemCount).toBe(1 + 4 + 2);
    s.selectAll();
    expect(s.selection.has(s.doc.zones[0].id)).toBe(true);
    expect(s.clearAll()).toBe(true);
    expect(s.doc.zones).toEqual([]);
    s.undo();
    expect(s.doc.zones).toHaveLength(1);
  });

  it("deleting a zone leaves its components alone, and duplicating copies only the zone", () => {
    const { s, zone } = board();
    const nodes = s.doc.nodes.length;
    s.select([zone]);
    s.duplicateSelected();
    expect(s.doc.zones).toHaveLength(2);
    expect(s.doc.nodes).toHaveLength(nodes);
    s.deleteSelected();
    expect(s.doc.zones).toHaveLength(1);
    expect(s.doc.nodes).toHaveLength(nodes);
  });

  it("replace swaps the board as one undo step and keeps the history", () => {
    const { s } = board();
    const next = emptyDoc();
    next.title = "Imported";
    next.zones.push({ id: "z9", gx: 0, gy: 0, w: 2, h: 2, label: "L", color: "#112233" });
    s.replace(next);
    expect(s.doc.title).toBe("Imported");
    expect(s.doc.nodes).toEqual([]);
    expect(s.doc.zones).toHaveLength(1);
    expect(s.selection.size).toBe(0);
    s.undo();
    expect(s.doc.nodes).toHaveLength(4);
    expect(s.doc.title).toBe("Untitled architecture");
  });
});

describe("zones: membership", () => {
  it("includes tiles inside, tiles on the border and text boxes inside, and leaves the rest", () => {
    const { s, zone, inside, border, justOut, below, text, outsideText } = board();
    const m = zoneMembers(s.doc, zone);
    expect(m.nodes).toContain(inside);
    expect(m.nodes).toContain(border); // the gateway sits on the zone edge
    expect(m.nodes).not.toContain(justOut);
    expect(m.nodes).not.toContain(below);
    expect(m.texts).toEqual([text]);
    expect(m.texts).not.toContain(outsideText);
  });

  it("uses a border of half a cell", () => {
    const { s, zone } = board();
    const z = s.zone(zone)!;
    expect(zoneContains(z, -ZONE_BORDER, 1)).toBe(false);
    expect(zoneContains(z, -ZONE_BORDER, 1, ZONE_BORDER)).toBe(true);
    expect(zoneContains(z, -ZONE_BORDER - 0.01, 1, ZONE_BORDER)).toBe(false);
  });

  it("treats a zone fully inside another as a member, but not equal or overlapping ones", () => {
    const s = new Store(emptyDoc());
    const outer = s.addZone(0, 0, 10, 10, "Outer");
    const inner = s.addZone(2, 2, 3, 3, "Inner");
    const partly = s.addZone(8, 8, 5, 5, "Partly");
    const same = s.addZone(0, 0, 10, 10, "Same");
    const m = zoneMembers(s.doc, outer);
    expect(m.zones).toEqual([inner]);
    expect(m.zones).not.toContain(partly);
    expect(m.zones).not.toContain(same);
    expect(zoneEncloses(s.zone(inner)!, s.zone(outer)!)).toBe(false);
    expect(zonesBigFirst(s.doc.zones)[0].w).toBe(10);
  });

  it("returns nothing for an unknown zone", () => {
    expect(zoneMembers(emptyDoc(), "nope")).toEqual({ nodes: [], texts: [], zones: [] });
  });
});
