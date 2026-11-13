import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDoc } from "../src/model/serialize";
import { NAME_RE } from "../src/share/links";

const DIR = "public/diagrams";
const index = JSON.parse(readFileSync(`${DIR}/index.json`, "utf8")) as { id: string; title: string; description: string }[];

describe("shipped examples", () => {
  it("lists every example file and nothing else", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.replace(/\.json$/, "")).sort();
    expect(index.map((e) => e.id).sort()).toEqual(files);
    expect(new Set(index.map((e) => e.id)).size).toBe(index.length);
  });

  it("gives each one a link safe name, a title and a description", () => {
    for (const e of index) {
      expect(e.id, e.id).toMatch(NAME_RE);
      expect(e.title.length, e.id).toBeGreaterThan(2);
      expect(e.description.length, e.id).toBeGreaterThan(10);
    }
  });

  it("opens every example, with something in it and a matching title", () => {
    for (const e of index) {
      const text = readFileSync(`${DIR}/${e.id}.json`, "utf8");
      const doc = parseDoc(text);
      expect(doc.nodes.length, e.id).toBeGreaterThan(3);
      expect(doc.title, e.id).toBe(e.title);
      // opening it changed nothing: what we ship is already in its clean form
      expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(doc)));
    }
  });

  it("keeps every arrow on real components and every step badge on a written step", () => {
    for (const e of index) {
      const doc = parseDoc(readFileSync(`${DIR}/${e.id}.json`, "utf8"));
      const ids = new Set(doc.nodes.map((n) => n.id));
      for (const a of doc.edges) {
        expect(ids.has(a.from) && ids.has(a.to), `${e.id} ${a.id}`).toBe(true);
        if (a.step) expect(a.step, `${e.id} ${a.id}`).toBeLessThanOrEqual(doc.steps.length);
      }
    }
  });

  it("never overlaps two components in an example", () => {
    for (const e of index) {
      const doc = parseDoc(readFileSync(`${DIR}/${e.id}.json`, "utf8"));
      for (const a of doc.nodes) for (const b of doc.nodes) {
        if (a !== b) expect(Math.abs(a.gx - b.gx) >= 0.75 || Math.abs(a.gy - b.gy) >= 0.75, `${e.id} ${a.id} ${b.id}`).toBe(true);
      }
    }
  });
});
