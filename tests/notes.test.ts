import { describe, expect, it } from "vitest";
import { boldRuns, parseNotes } from "../src/model/notes";
import { parseDoc, stringifyDoc } from "../src/model/serialize";
import { Store } from "../src/model/store";
import { NOTES_MAX, emptyDoc } from "../src/model/types";

describe("explanation markup", () => {
  it("reads headings, paragraphs and bullet lists", () => {
    expect(parseNotes("## Why\nFirst line\nsame paragraph\n\n- one\n- two\n### Cost\nText\r\n")).toEqual([
      { kind: "h2", text: "Why" },
      { kind: "p", text: "First line same paragraph" },
      { kind: "ul", items: ["one", "two"] },
      { kind: "h3", text: "Cost" },
      { kind: "p", text: "Text" },
    ]);
    expect(parseNotes("  \n\n")).toEqual([]);
  });

  it("splits bold words and leaves a lone marker alone", () => {
    expect(boldRuns("**Why:** speed")).toEqual([{ text: "Why:", bold: true }, { text: " speed", bold: false }]);
    expect(boldRuns("2 ** 3")).toEqual([{ text: "2 ** 3", bold: false }]);
  });
});

describe("explanation in a board", () => {
  const doc = (notes?: unknown) => JSON.stringify({ ...emptyDoc(), notes });

  it("survives saving and loading, within the length limit", () => {
    expect(parseDoc(stringifyDoc(parseDoc(doc("## Why\nBecause")))).notes).toBe("## Why\nBecause");
    expect(parseDoc(doc("a".repeat(NOTES_MAX + 5))).notes).toHaveLength(NOTES_MAX);
  });

  it("is left out when blank or not text", () => {
    for (const bad of [undefined, "   ", 7, ["a"]]) expect("notes" in parseDoc(doc(bad))).toBe(false);
  });

  it("follows the board when another one replaces it, and undo brings it back", () => {
    const s = new Store(parseDoc(doc("First")));
    s.replace(parseDoc(doc("Second")));
    expect(s.doc.notes).toBe("Second");
    s.replace(emptyDoc());
    expect(s.doc.notes).toBeUndefined();
    s.undo();
    expect(s.doc.notes).toBe("Second");
  });
});
