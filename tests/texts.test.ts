import { describe, expect, it } from "vitest";
import { ICONS, iconSvg } from "../src/glyphs/flatIcons";
import { ICON_NAMES, PALETTE_GROUPS } from "../src/glyphs/catalog";
import { createGlyph, disposeGlyph } from "../src/glyphs/models";
import { parseDoc, stringifyDoc } from "../src/model/serialize";
import { Store } from "../src/model/store";
import { TEXT_MAX_LENGTH } from "../src/model/types";

describe("text boxes in the store", () => {
  it("adds a snapped, selected text box and undoes it", () => {
    const s = new Store();
    const id = s.addText(1.3, 2.8, "Payments");
    const t = s.textBox(id)!;
    expect([t.gx, t.gy, t.text, t.size]).toEqual([1.5, 3, "Payments", "m"]);
    expect([...s.selection]).toEqual([id]);
    s.undo();
    expect(s.doc.texts).toHaveLength(0);
    expect(s.selection.size).toBe(0);
  });

  it("deletes, duplicates and selects text boxes together with tiles", () => {
    const s = new Store();
    const n = s.addNode("svc", 0, 0, "A");
    const t = s.addText(2, 0);
    s.selectAll();
    expect(new Set(s.selection)).toEqual(new Set([n, t]));
    s.duplicateSelected();
    expect(s.doc.nodes).toHaveLength(2);
    expect(s.doc.texts).toHaveLength(2);
    expect(new Set(s.doc.texts.map((x) => x.id)).size).toBe(2);
    s.select([t]);
    s.deleteSelected();
    expect(s.doc.texts).toHaveLength(1);
    expect(s.doc.nodes).toHaveLength(2);
  });
});

describe("older board objects", () => {
  it("get an empty text list when loaded into the store", () => {
    const old = { version: 1, title: "Old", nodes: [], edges: [], steps: [] } as unknown as Parameters<Store["load"]>[0];
    const s = new Store(old);
    expect(s.doc.texts).toEqual([]);
    s.load(old);
    expect(s.doc.texts).toEqual([]);
    expect(s.itemCount).toBe(0);
  });
});

describe("clear all", () => {
  it("removes tiles, arrows and text boxes but keeps the title and steps, and is one undo step", () => {
    const s = new Store();
    s.doc.title = "My board";
    s.doc.steps = ["one"];
    const a = s.addNode("svc", 0, 0, "A"), b = s.addNode("db", 4, 0, "B");
    s.addEdge(a, b);
    s.addText(2, 2);
    expect(s.itemCount).toBe(4);
    expect(s.clearAll()).toBe(true);
    expect(s.itemCount).toBe(0);
    expect(s.doc.title).toBe("My board");
    expect(s.doc.steps).toEqual(["one"]);
    expect(s.selection.size).toBe(0);
    s.undo();
    expect(s.itemCount).toBe(4);
    s.redo();
    expect(s.itemCount).toBe(0);
  });

  it("does nothing, and adds no history, on an empty board", () => {
    const s = new Store();
    expect(s.clearAll()).toBe(false);
    expect(s.canUndo).toBe(false);
  });
});

describe("text boxes in files", () => {
  it("round trips", () => {
    const s = new Store();
    s.addText(1, 1, "Line one\nLine two", "l");
    s.mutate((d) => { d.texts[0].boxed = true; });
    const back = parseDoc(stringifyDoc(s.doc));
    expect(back.texts).toEqual(s.doc.texts);
  });

  it("opens older files that have no texts", () => {
    const doc = parseDoc(JSON.stringify({ version: 1, title: "Old", nodes: [], edges: [], steps: [] }));
    expect(doc.texts).toEqual([]);
  });

  it("repairs bad text entries", () => {
    const doc = parseDoc(JSON.stringify({
      version: 1, title: "x", nodes: [{ id: "a", gx: 0, gy: 0, icon: "svc", label: "A" }], edges: [],
      texts: [
        { id: "a", gx: 1.2, gy: 2, text: "same id as a tile", size: "huge" },
        { gx: "bad", gy: 0, text: "dropped" },
        "junk",
        { id: "t9", gx: 0, gy: 0, text: "x".repeat(TEXT_MAX_LENGTH + 50), size: "s", boxed: "yes" },
      ],
    }));
    expect(doc.texts).toHaveLength(2);
    expect(doc.texts[0].id).not.toBe("a");
    expect(doc.texts[0].size).toBe("m");
    expect(doc.texts[0].gx).toBe(1);
    expect(doc.texts[1].text).toHaveLength(TEXT_MAX_LENGTH);
    expect(doc.texts[1].boxed).toBeUndefined();
  });
});

describe("decision diamond", () => {
  it("is a named palette component with a 3D model and a flat glyph", () => {
    expect(ICON_NAMES.decision).toMatch(/decision/i);
    expect(PALETTE_GROUPS.flatMap((g) => g.icons)).toContain("decision");
    expect(ICONS.decision(0, 0)).toContain("<path");
    expect(iconSvg("decision", "#000", 64)).toContain("?");
    const g = createGlyph("decision");
    let meshes = 0;
    g.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
    expect(meshes).toBeGreaterThanOrEqual(3);
    disposeGlyph(g);
  });

  it("is kept when a file is opened", () => {
    const doc = parseDoc(JSON.stringify({ version: 1, title: "x", nodes: [{ id: "d", gx: 0, gy: 0, icon: "decision", label: "In stock?" }], edges: [], steps: [] }));
    expect(doc.nodes[0].icon).toBe("decision");
  });
});

describe("palette sections", () => {
  it("has a Networking section with HTTP, REST, WebSocket, server-sent events and webhook", () => {
    const net = PALETTE_GROUPS.find((g) => g.title === "Networking");
    expect(net?.icons).toEqual(["http", "rest", "websocket", "sse", "webhook"]);
    expect(net!.icons.map((k) => ICON_NAMES[k])).toEqual(["HTTP", "REST API", "WebSocket", "Server-sent events", "Webhook"]);
  });

  it("has a Logic section with the flowchart blocks", () => {
    const logic = PALETTE_GROUPS.find((g) => g.title === "Logic");
    expect(logic?.icons).toEqual(["decision", "startend", "process", "loop", "fork", "timer", "trigger"]);
  });

  it("opens files that use the new blocks", () => {
    const keys = ["startend", "process", "loop", "fork", "timer", "trigger", "http", "rest", "websocket", "sse", "webhook"];
    const doc = parseDoc(JSON.stringify({ version: 1, title: "x", edges: [], steps: [], nodes: keys.map((icon, i) => ({ id: "n" + i, gx: i * 2, gy: 0, icon, label: icon })) }));
    expect(doc.nodes.map((n) => n.icon)).toEqual(keys);
  });
});

describe("AI components", () => {
  it("has an AI section with RAG, LLM, agent, embedding, retriever, prompt, guardrails, tools, memory and MCP", () => {
    const ai = PALETTE_GROUPS.find((g) => g.title === "AI");
    expect(ai?.icons).toEqual(["ai", "llm", "agent", "rag", "embed", "retriever", "prompt", "guard", "tools", "memory", "mcp"]);
    expect(ICON_NAMES.rag).toBe("RAG pipeline");
    expect(ICON_NAMES.llm).toBe("LLM");
  });

  it("opens files that use the AI components", () => {
    const keys = ["llm", "agent", "rag", "embed", "retriever", "prompt", "guard", "tools", "memory", "mcp"];
    const doc = parseDoc(JSON.stringify({ version: 1, title: "x", edges: [], steps: [], nodes: keys.map((icon, i) => ({ id: "n" + i, gx: i * 2, gy: 0, icon, label: icon })) }));
    expect(doc.nodes.map((n) => n.icon)).toEqual(keys);
  });
});

describe("two way arrows", () => {
  const board = (both: unknown) => JSON.stringify({
    version: 1, title: "x", steps: [],
    nodes: [{ id: "a", gx: 0, gy: 0, icon: "svc", label: "A" }, { id: "b", gx: 3, gy: 0, icon: "db", label: "B" }],
    edges: [{ id: "e1", from: "a", to: "b", both }],
  });

  it("keeps the both-ends flag through a file round trip", () => {
    const doc = parseDoc(board(true));
    expect(doc.edges[0].both).toBe(true);
    expect(parseDoc(stringifyDoc(doc)).edges[0].both).toBe(true);
  });

  it("drops the flag unless it is exactly true, and older boards stay one way", () => {
    expect(parseDoc(board("yes")).edges[0].both).toBeUndefined();
    expect(parseDoc(board(undefined)).edges[0].both).toBeUndefined();
  });
});
