import { describe, expect, it } from "vitest";
import { exampleDoc } from "../src/example";
import { parseDoc, stringifyDoc } from "../src/model/serialize";
import { packDoc, unpackDoc } from "../src/share/codec";
import { embedCode, namedLink, packedLink, parseViewParams, shortLink, viewerBase } from "../src/share/links";

const PAGE = "https://projects.tanmoybh.com/archboard-3d/";

describe("packed links", () => {
  it("round trips a board, zones and all, in a short URL safe string", async () => {
    const doc = exampleDoc();
    const packed = await packDoc(doc);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(packed.length).toBeLessThan(2500);
    expect(await unpackDoc(packed)).toEqual(parseDoc(stringifyDoc(doc)));
  });

  it("leaves the editor's bookkeeping id out of the link", async () => {
    const doc = { ...exampleDoc(), shareId: "abcdefghijkl" };
    expect((await unpackDoc(await packDoc(doc))).shareId).toBeUndefined();
  });

  it("explains damaged links instead of crashing", async () => {
    await expect(unpackDoc("")).rejects.toThrow(/damaged/);
    await expect(unpackDoc("%%%")).rejects.toThrow();
    await expect(unpackDoc("AAAA")).rejects.toThrow(/damaged/);
    const good = await packDoc(exampleDoc());
    await expect(unpackDoc(good.slice(0, 40))).rejects.toThrow(/damaged/);
  });

  it("refuses a link that inflates to more than the viewer will open", async () => {
    const bomb = await packDoc({ ...exampleDoc(), steps: ["a".repeat(5 * 1024 * 1024)] });
    await expect(unpackDoc(bomb)).rejects.toThrow(/more data/);
  });
});

describe("viewer links", () => {
  it("builds links relative to the page the editor is on", () => {
    expect(viewerBase(PAGE)).toBe(PAGE + "view/");
    expect(viewerBase("http://localhost:5173/")).toBe("http://localhost:5173/view/");
    expect(packedLink(PAGE, "abc")).toBe(PAGE + "view/#d=abc");
    expect(packedLink(PAGE, "abc", { mode: "2d", play: false, theme: "dark", controls: false })).toBe(PAGE + "view/?mode=2d&play=0&theme=dark&controls=0#d=abc");
    expect(namedLink(PAGE, "ticketing")).toBe(PAGE + "view/?d=ticketing");
    expect(shortLink(PAGE, "abcdefghijkl", { mode: "2d" })).toBe(PAGE + "v/abcdefghijkl?mode=2d");
  });

  it("omits options that are the viewer's defaults", () => {
    expect(packedLink(PAGE, "x", { mode: "3d", play: true, theme: "auto", controls: true })).toBe(PAGE + "view/#d=x");
  });

  it("makes safe embed code", () => {
    const code = embedCode(PAGE + 'view/?d=a"b', 'Nature <Risk> & "co"', 480);
    expect(code).toContain('height="480"');
    expect(code).toContain('title="Nature &lt;Risk&gt; &amp; &quot;co&quot;"');
    expect(code).toContain("&quot;");
    expect(code.match(/"/g)!.length % 2).toBe(0);
    expect(code).toMatch(/^<iframe /);
    expect(code).toContain("allowfullscreen");
  });

  it("reads what a link asks for, ignoring junk", () => {
    expect(parseViewParams("", "#d=abc")).toEqual({ source: { kind: "packed", data: "abc" }, opts: { mode: "3d", play: true, theme: "auto", controls: true } });
    expect(parseViewParams("?id=abcdefghijkl&mode=2d&play=0&theme=light&controls=0", "").opts).toEqual({ mode: "2d", play: false, theme: "light", controls: false });
    expect(parseViewParams("?d=ticketing", "").source).toEqual({ kind: "name", name: "ticketing" });
    expect(parseViewParams("?id=../../x", "").source).toBeNull();
    expect(parseViewParams("?d=../etc/passwd", "").source).toBeNull();
    expect(parseViewParams("?d=UPPER", "").source).toBeNull();
    expect(parseViewParams("?mode=sideways&theme=neon", "").opts).toMatchObject({ mode: "3d", theme: "auto" });
    expect(parseViewParams("", "").source).toBeNull();
  });

  it("prefers the packed data when a link has several sources", () => {
    expect(parseViewParams("?id=abcdefghijkl&d=ticketing", "#d=zzz").source).toEqual({ kind: "packed", data: "zzz" });
  });
});
