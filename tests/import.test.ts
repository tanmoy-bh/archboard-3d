import { describe, expect, it } from "vitest";
import { cleanLabel, describeReport, importDrawio, listPages } from "../src/import/drawio";
import { mapIcon } from "../src/import/iconMap";
import { decodeEntities, parseXml } from "../src/import/xml";
import { parseDoc, stringifyDoc } from "../src/model/serialize";
import { NODE_MIN_GAP } from "../src/model/types";
import { zoneMembers } from "../src/model/zones";

const model = (cells: string) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const file = (cells: string, name = "Page-1") => `<mxfile><diagram name="${name}" id="d">${model(cells)}</diagram></mxfile>`;
const box = (id: string, value: string, x: number, y: number, w = 120, h = 60, style = "rounded=1;whiteSpace=wrap;html=1;", parent = "1") =>
  `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const arrow = (id: string, s: string, t: string, value = "", style = "endArrow=classic;html=1;") =>
  `<mxCell id="${id}" value="${value}" style="${style}" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

describe("xml reader", () => {
  it("reads elements, attributes with > inside, text, comments and CDATA", () => {
    const n = parseXml(`<?xml version="1.0"?><!-- hi --><a x="1 > 0" y='q'><b/><c>text &amp; <![CDATA[raw <b>]]></c></a>`);
    expect(n.tag).toBe("a");
    expect(n.attrs).toEqual({ x: "1 > 0", y: "q" });
    expect(n.children.map((c) => c.tag)).toEqual(["b", "c"]);
    expect(n.children[1].text).toBe("text & raw <b>");
  });
  it("decodes entities", () => {
    expect(decodeEntities("&lt;b&gt; &#65;&#x42; &amp;amp; &unknown;")).toBe("<b> AB &amp; &unknown;");
  });
  it("rejects broken xml with a readable message", () => {
    expect(() => parseXml("<a><b></a>")).toThrow(/not valid XML/);
    expect(() => parseXml("<a>")).toThrow(/not closed/);
    expect(() => parseXml("")).toThrow();
  });
});

describe("labels", () => {
  it("turns html labels into plain text", () => {
    expect(cleanLabel("Order<br>Service &amp; more")).toBe("Order\nService & more");
    expect(cleanLabel("<div>Hi</div><div>there</div>")).toBe("Hi\nthere"); // as it looks after the XML reader decoded the attribute
    expect(cleanLabel("<b>Bold</b>")).toBe("Bold");
  });
});

describe("icon mapping", () => {
  const icon = (shape: string, label = "") => mapIcon(shape, label).icon;
  it("maps cloud services to the closest component", () => {
    expect(icon("mxgraph.aws4.sns")).toBe("bell");
    expect(icon("mxgraph.aws4.simple_notification_service")).toBe("bell");
    expect(icon("mxgraph.aws4.sqs")).toBe("queue");
    expect(icon("mxgraph.gcp2.cloud_pubsub")).toBe("queue");
    expect(icon("mxgraph.azure.service_bus")).toBe("queue");
    expect(icon("mxgraph.aws4.lambda_function")).toBe("lambda");
    expect(icon("mxgraph.aws4.s3")).toBe("blob");
    expect(icon("mxgraph.aws4.elasticache")).toBe("redis");
    expect(icon("mxgraph.aws4.application_load_balancer")).toBe("gateway");
    expect(icon("mxgraph.aws4.route_53")).toBe("dns");
    expect(icon("mxgraph.aws4.waf")).toBe("firewall");
    expect(icon("mxgraph.aws4.eks")).toBe("cluster");
    expect(icon("mxgraph.aws4.iam")).toBe("identity");
    expect(icon("mxgraph.aws4.kms")).toBe("key");
    expect(icon("mxgraph.aws4.redshift")).toBe("warehouse");
    expect(icon("mxgraph.aws4.glue")).toBe("etl");
    expect(icon("mxgraph.aws4.cloudwatch")).toBe("alarm");
    expect(icon("mxgraph.aws4.vpc")).toBe("network");
    expect(icon("mxgraph.aws4.glacier")).toBe("archive");
    expect(icon("mxgraph.aws4.efs")).toBe("files");
    expect(icon("mxgraph.aws4.iot_core")).toBe("iot");
    expect(icon("mxgraph.aws4.bedrock")).toBe("llm");
  });
  it("uses the label when the shape says nothing", () => {
    expect(icon("rounded", "Redis (Token Status)")).toBe("redis");
    expect(icon("", "Delay Queue (Redis)")).toBe("queue");
    expect(icon("", "Notification Service")).toBe("bell");
    expect(icon("", "Booking Service")).toBe("svc");
    expect(icon("", "Payment Provider")).toBe("card");
    expect(icon("", "Seating Cache")).toBe("redis");
    expect(icon("", "Web Client")).toBe("laptop");
    expect(icon("", "Mobile client")).toBe("phone");
    expect(icon("", "Web BFF")).toBe("svc");
    expect(icon("", "Mobile BFF")).toBe("svc");
  });
  it("falls back on generic shapes and then to a service, reporting the guess", () => {
    expect(mapIcon("shape=cylinder3", "")).toEqual({ icon: "db", guessed: false });
    expect(mapIcon("cloud", "")).toEqual({ icon: "cdn", guessed: false });
    expect(mapIcon("rhombus", "")).toEqual({ icon: "decision", guessed: false });
    expect(mapIcon("rounded", "Thing")).toEqual({ icon: "svc", guessed: true });
  });
});

describe("draw.io import", () => {
  it("imports shapes and arrows with their labels and styles", async () => {
    const xml = file(
      box("a", "Client", 0, 0, 80, 60) + box("b", "API Gateway", 200, 0) + box("c", "Orders DB", 400, 0, 80, 80, "shape=cylinder3;") +
      arrow("e1", "a", "b", "calls") + arrow("e2", "b", "c", "", "endArrow=classic;dashed=1;") + arrow("e3", "a", "c", "", "startArrow=classic;endArrow=classic;"),
    );
    const { doc, report } = await importDrawio(xml);
    expect(doc.nodes.map((n) => [n.label, n.icon])).toEqual([["Client", "laptop"], ["API Gateway", "gateway"], ["Orders DB", "db"]]);
    expect(doc.edges).toHaveLength(3);
    expect(doc.edges[0]).toMatchObject({ label: "calls" });
    expect(doc.edges[1].dash).toBe(true);
    expect(doc.edges[2].both).toBe(true);
    expect(report).toMatchObject({ tiles: 3, zones: 0, arrows: 3, skippedArrows: 0 });
    expect(parseDoc(stringifyDoc(doc)).nodes).toHaveLength(3); // the result is a valid board
  });

  it("turns a big rounded box around components into a zone, with its colour and label", async () => {
    const xml = file(
      box("z", "BFF layer", 0, 0, 500, 200, "rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;opacity=30;verticalAlign=top;") +
      box("a", "Web BFF", 40, 80) + box("b", "Mobile BFF", 300, 80) + box("c", "Core DB", 40, 400, 80, 80, "shape=cylinder3;"),
    );
    const { doc, report } = await importDrawio(xml);
    expect(report.zones).toBe(1);
    expect(doc.zones[0]).toMatchObject({ label: "BFF layer", color: "#6c8ebf" });
    const ids = zoneMembers(doc, doc.zones[0].id).nodes;
    const names = doc.nodes.filter((n) => ids.includes(n.id)).map((n) => n.label).sort();
    expect(names).toEqual(["Mobile BFF", "Web BFF"]);
    expect(names).not.toContain("Core DB");
  });

  it("treats swimlanes as zones and positions children relative to their container", async () => {
    const xml = file(
      `<mxCell id="s" value="Middleware" style="swimlane;startSize=30;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="400" height="200" as="geometry"/></mxCell>` +
      box("a", "Auth", 20, 60, 100, 50, "rounded=1;", "s") + box("b", "Billing", 220, 60, 100, 50, "rounded=1;", "s") + box("out", "Elsewhere", 700, 100),
    );
    const { doc } = await importDrawio(xml);
    expect(doc.zones).toHaveLength(1);
    const inZone = zoneMembers(doc, doc.zones[0].id).nodes.map((id) => doc.nodes.find((n) => n.id === id)!.label).sort();
    expect(inZone).toEqual(["Auth", "Billing"]);
  });

  it("keeps a small box with an icon inside as a component, not a zone", async () => {
    const xml = file(box("a", "Card", 0, 0, 100, 60) + box("b", "x", 10, 10, 30, 30));
    const { report } = await importDrawio(xml);
    expect(report.zones).toBe(0);
    expect(report.tiles).toBe(2);
  });

  it("turns text shapes into text boxes and uses text under an icon as its label", async () => {
    const xml = file(
      box("t", "A caption", 0, 300, 160, 30, "text;html=1;align=center;fontSize=20;") +
      box("i", "", 300, 0, 60, 60, "shape=mxgraph.aws4.sqs;") + box("l", "Jobs", 295, 70, 70, 20, "text;html=1;") + box("o", "Other", 600, 0),
    );
    const { doc } = await importDrawio(xml);
    expect(doc.texts).toHaveLength(1);
    expect(doc.texts[0]).toMatchObject({ text: "A caption", size: "l" });
    expect(doc.nodes.find((n) => n.icon === "queue")!.label).toBe("Jobs");
  });

  it("reverses an arrow that only has a start head, merges opposite arrows with equal labels, and drops duplicates", async () => {
    const xml = file(
      box("a", "A", 0, 0) + box("b", "B", 300, 0) + box("c", "C", 600, 0) +
      arrow("e1", "a", "b", "", "startArrow=classic;endArrow=none;") +
      arrow("e2", "b", "c", "x") + arrow("e3", "c", "b", "x") + arrow("e4", "b", "c", "x") + arrow("e5", "a", "nowhere"),
    );
    const { doc, report } = await importDrawio(xml);
    const name = (id: string) => doc.nodes.find((n) => n.id === id)!.label;
    expect(doc.edges.map((e) => `${name(e.from)}>${name(e.to)}${e.both ? "*" : ""}`)).toEqual(["B>A", "B>C*"]);
    expect(report.skippedArrows).toBe(2); // the duplicate and the one with no target
  });

  it("uses an arrow's label cell and skips arrows that end on a zone", async () => {
    const xml = file(
      box("z", "Layer", 0, 0, 600, 300) + box("a", "A", 50, 100) + box("b", "B", 350, 100) + arrow("e1", "a", "b") +
      `<mxCell id="lab" value="over wire" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e1"><mxGeometry as="geometry"/></mxCell>` + arrow("e2", "a", "z"),
    );
    const { doc, report } = await importDrawio(xml);
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0].label).toBe("over wire");
    expect(report.skippedArrows).toBe(1);
  });

  it("reads wrapped objects, hidden cells and layers", async () => {
    const xml = file(
      `<object label="Wrapped" id="w"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell></object>` +
      `<mxCell id="h" value="Hidden" style="" vertex="1" parent="1" visible="0"><mxGeometry x="200" y="0" width="100" height="50" as="geometry"/></mxCell>`,
    );
    const { doc } = await importDrawio(xml);
    expect(doc.nodes.map((n) => n.label)).toEqual(["Wrapped"]);
  });

  it("never lets components overlap, whatever the source layout", async () => {
    const cells = Array.from({ length: 30 }, (_, i) => box(`n${i}`, `N${i}`, (i % 6) * 12, Math.floor(i / 6) * 9, 100, 50)).join("");
    const { doc } = await importDrawio(file(cells));
    expect(doc.nodes).toHaveLength(30);
    for (const a of doc.nodes) for (const b of doc.nodes) {
      if (a === b) continue;
      expect(Math.abs(a.gx - b.gx) >= NODE_MIN_GAP || Math.abs(a.gy - b.gy) >= NODE_MIN_GAP).toBe(true);
    }
  });

  it("keeps the layout: left stays left of right", async () => {
    const { doc } = await importDrawio(file(box("a", "Left", 0, 0) + box("b", "Right", 400, 0) + box("c", "Below", 0, 300)));
    const by = (l: string) => doc.nodes.find((n) => n.label === l)!;
    expect(by("Left").gx).toBeLessThan(by("Right").gx);
    expect(by("Below").gy).toBeGreaterThan(by("Left").gy);
  });

  it("lists pages and imports the one asked for", async () => {
    const xml = `<mxfile><diagram name="One">${model(box("a", "First", 0, 0))}</diagram><diagram name="Two">${model(box("b", "Second", 0, 0))}</diagram></mxfile>`;
    expect(await listPages(xml)).toEqual(["One", "Two"]);
    expect((await importDrawio(xml, 1)).doc.nodes[0].label).toBe("Second");
    expect((await importDrawio(xml, 1)).report).toMatchObject({ page: "Two", pages: 2 });
    await expect(importDrawio(xml, 5)).rejects.toThrow(/not in the file/);
  });

  it("opens a bare mxGraphModel and a compressed page", async () => {
    expect((await importDrawio(model(box("a", "Bare", 0, 0)))).doc.nodes[0].label).toBe("Bare");
    const inner = model(box("a", "Packed", 0, 0)) ;
    const raw = new TextEncoder().encode(encodeURIComponent(inner));
    const packed = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(packed).arrayBuffer());
    const b64 = btoa(String.fromCharCode(...bytes));
    const xml = `<mxfile><diagram name="Zipped">${b64}</diagram></mxfile>`;
    expect((await importDrawio(xml)).doc.nodes[0].label).toBe("Packed");
  });

  it("explains problems clearly", async () => {
    await expect(importDrawio("<html></html>")).rejects.toThrow(/does not look like a draw\.io/);
    await expect(importDrawio("not xml")).rejects.toThrow();
    await expect(importDrawio(file(""))).rejects.toThrow(/nothing to import/);
    const many = Array.from({ length: 401 }, (_, i) => box(`n${i}`, `N${i}`, i * 150, 0)).join("");
    await expect(importDrawio(file(many))).rejects.toThrow(/401 shapes/);
    await expect(importDrawio(`<mxfile><diagram name="Bad">!!!not base64!!!</diagram></mxfile>`)).rejects.toThrow();
  });

  it("describes the result in one sentence", async () => {
    const { report } = await importDrawio(file(box("a", "Thing", 0, 0)));
    expect(describeReport(report)).toMatch(/Imported "Page-1": 1 components, 0 zones, 0 arrows\. 1 shown as a plain Service/);
  });
});
