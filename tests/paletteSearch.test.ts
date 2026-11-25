import { describe, expect, it } from "vitest";
import { PALETTE_GROUPS } from "../src/glyphs/catalog";
import { ICON_ALIASES, searchComponents } from "../src/glyphs/search";
import { isIconKey } from "../src/model/types";

const all = PALETTE_GROUPS.flatMap((g) => g.icons);

describe("palette search", () => {
  it("an empty search keeps every component", () => {
    expect(searchComponents("").size).toBe(all.length);
    expect(searchComponents("   ").size).toBe(all.length);
  });

  it("finds a component by its name, by part of a word, and ignores case", () => {
    expect(searchComponents("Gateway").has("gateway")).toBe(true);
    expect(searchComponents("kube").has("cluster")).toBe(true);
    expect(searchComponents("DATA WARE").has("warehouse")).toBe(true);
  });

  it("finds a component by the name of a cloud service", () => {
    expect(searchComponents("s3").has("blob")).toBe(true);
    expect(searchComponents("kafka").has("queue")).toBe(true);
    expect(searchComponents("sqs").has("queue")).toBe(true);
    expect(searchComponents("iam").has("identity")).toBe(true);
    expect(searchComponents("k8s").has("cluster")).toBe(true);
    expect(searchComponents("api gateway").has("apigw")).toBe(true);
    expect(searchComponents("login").has("auth")).toBe(true);
  });

  it("finds every component of a group by the group name", () => {
    const hits = searchComponents("networking");
    for (const icon of PALETTE_GROUPS.find((g) => g.title === "Networking")!.icons) expect(hits.has(icon)).toBe(true);
  });

  it("needs every word to match, and matches the start of a word, not the middle", () => {
    expect(searchComponents("queue kafka").has("queue")).toBe(true);
    expect(searchComponents("queue zzzz").size).toBe(0);
    expect(searchComponents("ueue").size).toBe(0);
  });

  it("every other name points at a real component in the palette", () => {
    for (const k of Object.keys(ICON_ALIASES)) {
      expect(isIconKey(k)).toBe(true);
      expect(all).toContain(k);
    }
  });
});
