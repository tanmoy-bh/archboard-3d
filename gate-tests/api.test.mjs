import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as readOne } from "../functions/api/d/[id].js";
import { onRequestGet as list, onRequestPost as publish } from "../functions/api/diagrams/index.js";
import { onRequestPut as update, onRequestDelete as remove } from "../functions/api/diagrams/[id].js";
import { onRequestGet as shortLink } from "../functions/v/[id].js";
import { ID_RE, newId } from "../server/diagrams.js";

const ORIGIN = "https://tanmoybh-archboard-3d.pages.dev";

/** The few KV calls the routes use, kept in memory. */
function fakeKv() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.has(k) ? map.get(k).value : null; },
    async put(k, value, opts = {}) { map.set(k, { value, metadata: opts.metadata }); },
    async delete(k) { map.delete(k); },
    async list({ prefix = "" } = {}) {
      return { keys: [...map.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true };
    },
  };
}

const board = (extra = {}) => ({ version: 1, title: "My board", nodes: [{ id: "n1", gx: 0, gy: 0, icon: "svc", label: "A" }], edges: [], texts: [], zones: [], steps: [], ...extra });
const post = (body, headers = {}) => new Request(ORIGIN + "/api/diagrams", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });

test("ids are 12 unguessable lower case letters and digits", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const id = newId();
    assert.match(id, /^[a-z0-9]{12}$/);
    assert.ok(ID_RE.test(id));
    seen.add(id);
  }
  assert.equal(seen.size, 500);
});

test("without the KV binding every route says publishing is not set up", async () => {
  for (const res of [await publish({ request: post(board()), env: {} }), await list({ env: {} }), await readOne({ params: { id: "abcdefghijkl" }, env: {} })]) {
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /not set up/);
  }
});

test("publish, read back publicly, update in place, list and delete", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const res = await publish({ request: post(board({ shareId: "zzzzzzzzzzzz" })), env });
  assert.equal(res.status, 201);
  const { id, title } = await res.json();
  assert.match(id, /^[a-z0-9]{12}$/);
  assert.equal(title, "My board");

  const read = await readOne({ params: { id }, env });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("Cache-Control"), "public, max-age=30");
  assert.equal(read.headers.get("Access-Control-Allow-Origin"), "*");
  const stored = await read.json();
  assert.equal(stored.title, "My board");
  assert.equal(stored.shareId, undefined); // the id is not stored inside the board

  const upd = await update({ request: new Request(ORIGIN + "/api/diagrams/" + id, { method: "PUT", body: JSON.stringify(board({ title: "Renamed" })) }), params: { id }, env });
  assert.equal(upd.status, 200);
  assert.equal((await (await readOne({ params: { id }, env })).json()).title, "Renamed");

  const items = (await (await list({ env })).json()).items;
  assert.deepEqual(items.map((i) => [i.id, i.title]), [[id, "Renamed"]]);
  assert.match(items[0].updated, /^\d{4}-\d\d-\d\dT/);

  const del = await remove({ request: new Request(ORIGIN + "/api/diagrams/" + id, { method: "DELETE" }), params: { id }, env });
  assert.equal((await del.json()).deleted, true);
  assert.equal((await readOne({ params: { id }, env })).status, 404);
  assert.deepEqual((await (await list({ env })).json()).items, []);
});

test("updating a link that does not exist is a 404, not a new link", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const res = await update({ request: new Request(ORIGIN + "/api/diagrams/abcdefghijkl", { method: "PUT", body: JSON.stringify(board()) }), params: { id: "abcdefghijkl" }, env });
  assert.equal(res.status, 404);
  assert.equal(env.DIAGRAMS.map.size, 0);
});

test("bad ids never reach the store", async () => {
  const env = { DIAGRAMS: fakeKv() };
  for (const id of ["", "short", "UPPERCASE123", "has-dash-12345", "a".repeat(40), "../etc"]) {
    assert.equal((await readOne({ params: { id }, env })).status, 404, id);
  }
});

test("rejects things that are not boards, and boards that are too big", async () => {
  const env = { DIAGRAMS: fakeKv() };
  assert.equal((await publish({ request: post("not json"), env })).status, 400);
  assert.equal((await publish({ request: post([1, 2]), env })).status, 400);
  assert.equal((await publish({ request: post({ version: 2, nodes: [] }), env })).status, 400);
  assert.equal((await publish({ request: post({ version: 1 }), env })).status, 400);
  const many = board({ nodes: Array.from({ length: 601 }, (_, i) => ({ id: "n" + i, gx: i, gy: 0, icon: "svc", label: "" })) });
  assert.equal((await publish({ request: post(many), env })).status, 413);
  const big = board({ steps: ["x".repeat(600 * 1024)] });
  assert.equal((await publish({ request: post(big), env })).status, 413);
  assert.equal(env.DIAGRAMS.map.size, 0);
});

test("a long or missing title is tidied", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const long = await (await publish({ request: post(board({ title: "T".repeat(300) })), env })).json();
  assert.equal(long.title.length, 120);
  const none = await (await publish({ request: post(board({ title: "  " })), env })).json();
  assert.equal(none.title, "Untitled architecture");
});

test("writes that a browser says came from another site are refused", async () => {
  const env = { DIAGRAMS: fakeKv() };
  assert.equal((await publish({ request: post(board(), { "Sec-Fetch-Site": "cross-site" }), env })).status, 403);
  assert.equal((await publish({ request: post(board(), { Origin: "https://evil.example" }), env })).status, 403);
  assert.equal((await publish({ request: post(board(), { "Sec-Fetch-Site": "same-origin", Origin: "https://projects.tanmoybh.com" }), env })).status, 201); // behind the hub
  assert.equal((await publish({ request: post(board(), { Origin: ORIGIN }), env })).status, 201);
  const id = [...env.DIAGRAMS.map.keys()][0].slice(2);
  const del = await remove({ request: new Request(ORIGIN + "/api/diagrams/" + id, { method: "DELETE", headers: { "Sec-Fetch-Site": "cross-site" } }), params: { id }, env });
  assert.equal(del.status, 403);
});

test("the short link redirects to the viewer and keeps the view options", async () => {
  const res = await shortLink({ request: new Request(ORIGIN + "/v/abcdefghijkl?mode=2d&play=0&junk=1"), params: { id: "abcdefghijkl" } });
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get("Location"));
  assert.equal(to.origin + to.pathname, ORIGIN + "/view/");
  assert.equal(to.searchParams.get("id"), "abcdefghijkl");
  assert.equal(to.searchParams.get("mode"), "2d");
  assert.equal(to.searchParams.get("play"), "0");
  assert.equal(to.searchParams.get("junk"), null);
  assert.equal((await shortLink({ request: new Request(ORIGIN + "/v/x"), params: { id: "x" } })).status, 404);
});
