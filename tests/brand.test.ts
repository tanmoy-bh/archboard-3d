import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ICON_NAMES, PALETTE_GROUPS } from "../src/glyphs/catalog";
import { BRAND_LOGOS } from "../src/glyphs/brandLogos";
import { iconSvg } from "../src/glyphs/flatIcons";
import { logoCells } from "../src/glyphs/logoGrid";
import { logosReady } from "../src/glyphs/logoTexture";
import { createGlyph, disposeGlyph } from "../src/glyphs/models";
import { searchComponents } from "../src/glyphs/search";
import { mapIcon } from "../src/import/iconMap";
import { BRAND_KEYS, isBrandKey } from "../src/model/brandKeys";
import { parseDoc, stringifyDoc } from "../src/model/serialize";
import { ALSO_MAX, emptyDoc, iconKeysOf, isIconKey } from "../src/model/types";

const AI_TOOLS = ["claude", "gemini", "openai", "openrouter", "codex", "opencode", "antigravity", "copilot", "meta", "ollama", "mcp-logo", "langchain"] as const;
const PLATFORM_TOOLS = ["slack", "n8n", "github", "temporal", "postgresql", "opensearch", "kubernetes", "onepassword", "aws-secrets-manager", "aws-bedrock", "microsoft", "terraform", "atlassian"] as const;

describe("tool logos", () => {
  it("has the AI tools and the common platform tools", () => {
    for (const k of [...AI_TOOLS, ...PLATFORM_TOOLS, "github-actions", "aws-lambda", "aws-s3"]) expect(isBrandKey(k), k).toBe(true);
    expect(new Set(BRAND_KEYS).size).toBe(BRAND_KEYS.length);
  });

  it("gives every tool a logo, a name, and one place in the palette", () => {
    const listed = PALETTE_GROUPS.flatMap((g) => g.icons);
    for (const k of BRAND_KEYS) {
      expect(isIconKey(k), k).toBe(true);
      expect(BRAND_LOGOS[k].body.length, k).toBeGreaterThan(40);
      expect(ICON_NAMES[k], k).toBeTruthy();
      expect(listed.filter((x) => x === k), k).toHaveLength(1);
    }
  });

  it("embeds no scripts, event handlers or outside links", () => {
    for (const k of BRAND_KEYS) {
      expect(BRAND_LOGOS[k].body, k).not.toMatch(/<script|<foreignObject|<image|<style|\son\w+=|javascript:|href="(?!#)|url\((?!#)/i);
    }
  });

  it("draws the real Slack logo, in its four colours", () => {
    const svg = iconSvg("slack", "#fff", 96).toLowerCase();
    for (const c of ["#e01e5a", "#36c5f0", "#2eb67d", "#ecb22e"]) expect(svg).toContain(c);
  });

  it("draws every logo of a shared box in 2D", () => {
    const svg = iconSvg("slack", "#fff", 96, ["n8n", "github"]);
    expect(svg.match(/<svg/g)).toHaveLength(4); // the outer drawing and one per logo
    expect(svg.toLowerCase()).toContain("#ea4b71"); // n8n pink
  });
});

describe("several logos in one box", () => {
  it("lays up to six cells out inside the box without overlap", () => {
    for (let n = 1; n <= ALSO_MAX + 1; n++) {
      const cells = logoCells(n);
      expect(cells).toHaveLength(n);
      for (const a of cells) {
        expect(Math.abs(a.x) + a.size / 2).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(Math.abs(a.y) + a.size / 2).toBeLessThanOrEqual(0.5 + 1e-9);
        for (const b of cells) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual((a.size + b.size) / 2 - 1e-9);
      }
    }
    expect(ALSO_MAX).toBe(5);
  });

  const board = (node: object) => JSON.stringify({ version: 1, title: "t", nodes: [{ id: "a", gx: 0, gy: 0, label: "A", ...node }], edges: [] });

  it("keeps the extra logos when a board is saved and opened again", () => {
    const doc = parseDoc(board({ icon: "claude", also: ["codex", "copilot", "antigravity", "opencode"] }));
    expect(parseDoc(stringifyDoc(doc)).nodes[0].also).toEqual(["codex", "copilot", "antigravity", "opencode"]);
    expect(iconKeysOf(doc.nodes[0])).toEqual(["claude", "codex", "copilot", "antigravity", "opencode"]);
  });

  it("drops extras that are unknown, generic, repeated or too many", () => {
    const doc = parseDoc(board({ icon: "claude", also: ["claude", "nope", "db", "codex", "codex", "slack", "n8n", "github", "docker", "helm", 7] }));
    expect(doc.nodes[0].also).toEqual(["codex", "slack", "n8n", "github", "docker"]);
  });

  it("allows extras only next to a tool logo, and adds no field when there are none", () => {
    expect("also" in parseDoc(board({ icon: "db", also: ["slack"] })).nodes[0]).toBe(false);
    expect("also" in parseDoc(board({ icon: "slack", also: [] })).nodes[0]).toBe(false);
    expect("also" in parseDoc(board({ icon: "slack", also: "n8n" })).nodes[0]).toBe(false);
    expect(iconKeysOf(emptyDoc().nodes[0] ?? { icon: "db" })).toEqual(["db"]);
  });
});

describe("3D tool emblems", () => {
  const bounds = (keys: Parameters<typeof createGlyph>[0][]) => {
    const g = createGlyph(keys[0], keys.slice(1).filter(isBrandKey));
    g.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.group);
    let meshes = 0;
    g.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
    disposeGlyph(g);
    return { size: box.getSize(new THREE.Vector3()), min: box.min, meshes };
  };

  it("builds a solid emblem, with depth, inside the space a model may use", () => {
    for (const k of BRAND_KEYS) {
      const b = bounds([k]);
      expect(b.meshes, k).toBeGreaterThanOrEqual(2); // a front face and sides
      expect(b.size.z, k).toBeGreaterThan(0.1);
      expect(Math.max(b.size.x, b.size.z), k).toBeLessThanOrEqual(1.4);
      expect(b.size.y, k).toBeLessThanOrEqual(1.4);
      expect(b.min.y, k).toBeGreaterThanOrEqual(-0.01);
    }
  });

  it("shows one emblem for each logo of a shared box, still inside the space", () => {
    const one = bounds(["claude"]);
    const five = bounds(["claude", "codex", "copilot", "antigravity", "opencode"]);
    expect(five.meshes).toBeGreaterThanOrEqual(one.meshes * 5 - 5);
    expect(Math.max(five.size.x, five.size.z)).toBeLessThanOrEqual(1.4);
    expect(five.size.y).toBeLessThanOrEqual(1.4);
  });
});

describe("finding tool logos", () => {
  it("finds tools by name, and AWS services by their short names", () => {
    expect(searchComponents("slack").has("slack")).toBe(true);
    expect(searchComponents("anti").has("antigravity")).toBe(true);
    expect(searchComponents("open code").has("opencode")).toBe(true);
    expect(searchComponents("aws").has("aws-lambda")).toBe(true);
    expect(searchComponents("secrets manager").has("aws-secrets-manager")).toBe(true);
    expect(searchComponents("sqs").has("aws-sqs")).toBe(true);
    expect(searchComponents("sqs").has("queue")).toBe(true);
    expect(searchComponents("postgres").has("postgresql")).toBe(true);
  });

  it("uses a tool's logo on import when a shape is that tool", () => {
    const icon = (shape: string, label = "") => mapIcon(shape, label).icon;
    expect(icon("rounded", "Slack")).toBe("slack");
    expect(icon("", "n8n")).toBe("n8n");
    expect(icon("", "Amazon S3")).toBe("aws-s3");
    expect(icon("", "GitHub Actions")).toBe("github-actions");
    expect(icon("", "OpenSearch")).toBe("opensearch");
    expect(icon("mxgraph.aws4.resourceicon mxgraph.aws4.lambda")).toBe("aws-lambda");
    expect(icon("mxgraph.aws4.secrets_manager")).toBe("aws-secrets-manager");
  });

  it("keeps the generic component when a tool is only mentioned", () => {
    const icon = (label: string) => mapIcon("", label).icon;
    expect(icon("Delay Queue (Redis)")).toBe("queue");
    expect(icon("Redis (Token Status)")).toBe("redis");
    expect(icon("Slack notification service")).toBe("bell");
    expect(icon("Seating Cache")).toBe("redis");
  });
});

describe("exporting a picture", () => {
  it("waits until every logo on the board has been drawn, extras included", async () => {
    const asked: string[] = [], waiting: (() => void)[] = [];
    const load = (k: string) => { asked.push(k); return { ready: new Promise<void>((r) => waiting.push(r)) }; };
    let done = false;
    const nodes = [{ icon: "db" as const }, { icon: "slack" as const }, { icon: "claude" as const, also: ["codex" as const, "slack" as const] }];
    const all = logosReady(nodes, load).then(() => { done = true; });
    expect(asked.sort()).toEqual(["claude", "codex", "slack"]); // each logo once, nothing for a generic component
    waiting.slice(0, -1).forEach((finish) => finish());
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false);
    waiting.at(-1)!();
    await all;
    expect(done).toBe(true);
  });
});
