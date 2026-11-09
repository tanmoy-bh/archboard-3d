import { describe, expect, it } from "vitest";
import { Store } from "../src/model/store";
import { parseDoc, stringifyDoc } from "../src/model/serialize";

describe("Store", () => {
  it("adds nodes snapped to half cells and selects them", () => {
    const s = new Store();
    const id = s.addNode("db", 1.26, 2.74, "Orders DB");
    const n = s.node(id)!;
    expect(n.gx).toBe(1.5);
    expect(n.gy).toBe(2.5);
    expect([...s.selection]).toEqual([id]);
  });

  it("undoes and redoes", () => {
    const s = new Store();
    s.addNode("svc", 0, 0, "A");
    s.addNode("svc", 2, 0, "B");
    expect(s.doc.nodes).toHaveLength(2);
    s.undo();
    expect(s.doc.nodes).toHaveLength(1);
    s.redo();
    expect(s.doc.nodes).toHaveLength(2);
    s.undo(); s.undo();
    expect(s.doc.nodes).toHaveLength(0);
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(true);
  });

  it("clears redo history after a new change", () => {
    const s = new Store();
    s.addNode("svc", 0, 0, "A");
    s.undo();
    s.addNode("svc", 4, 0, "B");
    expect(s.canRedo).toBe(false);
  });

  it("merges rapid edits with the same coalesce key into one undo step", () => {
    const s = new Store();
    const id = s.addNode("svc", 0, 0, "A");
    for (const ch of ["Au", "Aut", "Auth"]) s.mutate((d) => { d.nodes[0].label = ch; }, "label:" + id);
    expect(s.node(id)!.label).toBe("Auth");
    s.undo(); // undoes all typing in one go
    expect(s.node(id)!.label).toBe("A");
  });

  it("records a drag as a single undo step", () => {
    const s = new Store();
    const id = s.addNode("svc", 0, 0, "A");
    s.beginTransient();
    for (let i = 1; i <= 5; i++) s.transient((d) => { d.nodes[0].gx = i; });
    s.endTransient(true);
    expect(s.node(id)!.gx).toBe(5);
    s.undo();
    expect(s.node(id)!.gx).toBe(0);
  });

  it("does not record an undo step for a drag that went nowhere", () => {
    const s = new Store();
    s.addNode("svc", 0, 0, "A");
    s.undo(); s.redo();
    const before = s.canUndo;
    s.beginTransient();
    s.transient((d) => { d.nodes[0].gx = 3; });
    s.transient((d) => { d.nodes[0].gx = 0; });
    s.endTransient(true);
    expect(s.canUndo).toBe(before);
    s.undo();
    expect(s.doc.nodes).toHaveLength(0);
  });

  it("deleting a node removes its edges and prunes the selection", () => {
    const s = new Store();
    const a = s.addNode("svc", 0, 0, "A");
    const b = s.addNode("db", 2, 0, "B");
    const e = s.addEdge(a, b)!;
    expect(s.doc.edges).toHaveLength(1);
    s.select([a]);
    s.deleteSelected();
    expect(s.doc.nodes.map((n) => n.id)).toEqual([b]);
    expect(s.doc.edges).toHaveLength(0);
    expect(s.selection.has(e)).toBe(false);
    s.undo();
    expect(s.doc.edges).toHaveLength(1);
  });

  it("rejects self loops and duplicate edges", () => {
    const s = new Store();
    const a = s.addNode("svc", 0, 0, "A");
    const b = s.addNode("svc", 2, 0, "B");
    expect(s.addEdge(a, a)).toBeNull();
    expect(s.addEdge(a, b)).not.toBeNull();
    expect(s.addEdge(a, b)).toBeNull();
    expect(s.addEdge(b, a)).not.toBeNull(); // the reverse direction is a different arrow
  });

  it("finds free space and refuses overlaps", () => {
    const s = new Store();
    s.addNode("svc", 0, 0, "A");
    expect(s.isFree(0.5, 0.5)).toBe(false);
    expect(s.isFree(1, 0)).toBe(true);
    const p = s.nearestFree(0, 0);
    expect(s.isFree(p.gx, p.gy)).toBe(true);
  });

  it("duplicates selected nodes together with the edges between them", () => {
    const s = new Store();
    const a = s.addNode("svc", 0, 0, "A");
    const b = s.addNode("db", 2, 0, "B");
    s.addEdge(a, b);
    s.select([a, b]);
    s.duplicateSelected();
    expect(s.doc.nodes).toHaveLength(4);
    expect(s.doc.edges).toHaveLength(2);
    expect(s.selection.size).toBe(2);
  });

  it("reverses an edge", () => {
    const s = new Store();
    const a = s.addNode("svc", 0, 0, "A");
    const b = s.addNode("svc", 2, 0, "B");
    const e = s.addEdge(a, b)!;
    s.reverseEdge(e);
    expect(s.edge(e)).toMatchObject({ from: b, to: a });
  });
});

describe("serialize", () => {
  it("round trips a board", () => {
    const s = new Store();
    const a = s.addNode("gateway", 0, 0, "Gateway");
    const b = s.addNode("db", 2, 0.5, "DB");
    const e = s.addEdge(a, b)!;
    s.mutate((d) => { Object.assign(d.edges[0], { label: "read", step: 2, hot: true, dash: true }); });
    s.mutate((d) => { d.steps = ["one", "two"]; d.title = "Demo"; });
    const back = parseDoc(stringifyDoc(s.doc));
    expect(back).toEqual(s.doc);
    expect(back.edges[0].id).toBe(e);
  });

  it("rejects bad input with readable errors", () => {
    expect(() => parseDoc("nope")).toThrow(/not valid JSON/);
    expect(() => parseDoc("[]")).toThrow(/object/);
    expect(() => parseDoc('{"version":2,"nodes":[]}')).toThrow(/version/);
    expect(() => parseDoc('{"version":1}')).toThrow(/nodes/);
    expect(() => parseDoc('{"version":1,"nodes":[{"gx":"a","gy":1}]}')).toThrow(/position/);
  });

  it("repairs soft problems instead of failing", () => {
    const doc = parseDoc(JSON.stringify({
      version: 1,
      nodes: [
        { id: "a", gx: 0.26, gy: 0, icon: "unicorn", label: "A" },
        { id: "a", gx: 3, gy: 0, icon: "db", label: "dup id" },
      ],
      edges: [
        { id: "e", from: "a", to: "ghost" },
        { id: "f", from: "a", to: "a" },
      ],
    }));
    expect(doc.nodes).toHaveLength(2);
    expect(new Set(doc.nodes.map((n) => n.id)).size).toBe(2);
    expect(doc.nodes[0].icon).toBe("svc");
    expect(doc.nodes[0].gx).toBe(0.5);
    expect(doc.edges).toHaveLength(0);
  });
});
