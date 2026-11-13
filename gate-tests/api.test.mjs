import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as readPublic } from "../functions/api/d/[id].js";
import { onRequestGet as list, onRequestPost as save } from "../functions/api/diagrams/index.js";
import { onRequestGet as readOwner, onRequestPut as update, onRequestDelete as remove } from "../functions/api/diagrams/[id].js";
import { onRequestPost as setShared } from "../functions/api/diagrams/[id]/shared.js";
import { onRequestGet as shortLink } from "../functions/v/[id].js";
import { ID_RE, newId } from "../server/diagrams.js";

const ORIGIN = "https://tanmoybh-archboard-3d.pages.dev";

/** The few KV calls the routes use, kept in memory. */
function fakeKv() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.has(k) ? map.get(k).value : null; },
    async getWithMetadata(k) { return map.has(k) ? { value: map.get(k).value, metadata: map.get(k).metadata } : { value: null, metadata: null }; },
    async put(k, value, opts = {}) { map.set(k, { value, metadata: opts.metadata }); },
    async delete(k) { map.delete(k); },
    async list({ prefix = "" } = {}) {
      return { keys: [...map.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true };
    },
  };
}

const board = (extra = {}) => ({ version: 1, title: "My board", nodes: [{ id: "n1", gx: 0, gy: 0, icon: "svc", label: "A" }], edges: [], texts: [], zones: [], steps: [], ...extra });
const post = (body, headers = {}, query = "") => new Request(ORIGIN + "/api/diagrams" + query, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
const put = (id, body, query = "", headers = {}) => new Request(`${ORIGIN}/api/diagrams/${id}${query}`, { method: "PUT", body: JSON.stringify(body), headers });
const pub = (id, env) => readPublic({ params: { id }, env });
const own = (id, env) => readOwner({ params: { id }, env });

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

test("without the KV binding every route says saving is not set up", async () => {
  for (const res of [await save({ request: post(board()), env: {} }), await list({ env: {} }), await pub("abcdefghijkl", {}), await own("abcdefghijkl", {})]) {
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /not set up/);
  }
});

test("a saved board is private: the owner can read it, the public cannot", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const res = await save({ request: post(board({ boardId: "zzzzzzzzzzzz", shareId: "yyyyyyyyyyyy" })), env });
  assert.equal(res.status, 201);
  const { id, title, shared } = await res.json();
  assert.match(id, /^[a-z0-9]{12}$/);
  assert.equal(title, "My board");
  assert.equal(shared, false);
  assert.equal((await pub(id, env)).status, 404); // saved, not shared
  const mine = await own(id, env);
  assert.equal(mine.status, 200);
  assert.equal(mine.headers.get("Cache-Control"), "no-store");
  const stored = await mine.json();
  assert.equal(stored.title, "My board");
  assert.equal(stored.boardId, undefined); // the id is not stored inside the board
  assert.equal(stored.shareId, undefined);
});

test("sharing makes it public, and stopping makes it private again, without touching the content", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const { id } = await (await save({ request: post(board()), env })).json();
  const on = await setShared({ request: new Request(`${ORIGIN}/api/diagrams/${id}/shared`, { method: "POST", body: JSON.stringify({ shared: true }) }), params: { id }, env });
  assert.deepEqual(await on.json(), { id, shared: true });
  const read = await pub(id, env);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("Cache-Control"), "public, max-age=30");
  assert.equal(read.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal((await read.json()).title, "My board");
  const off = await setShared({ request: new Request(`${ORIGIN}/api/diagrams/${id}/shared`, { method: "POST", body: JSON.stringify({ shared: false }) }), params: { id }, env });
  assert.equal((await off.json()).shared, false);
  assert.equal((await pub(id, env)).status, 404);
  assert.equal((await (await own(id, env)).json()).title, "My board");
});

test("a board can be saved straight as shared, and listing shows which are shared", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const a = await (await save({ request: post(board({ title: "Private one" })), env })).json();
  const b = await (await save({ request: post(board({ title: "Shared one" }), {}, "?shared=1"), env })).json();
  assert.equal(b.shared, true);
  assert.equal((await pub(b.id, env)).status, 200);
  assert.equal((await pub(a.id, env)).status, 404);
  const items = (await (await list({ env })).json()).items;
  assert.deepEqual(items.map((i) => [i.title, i.shared]).sort(), [["Private one", false], ["Shared one", true]]);
  assert.match(items[0].updated, /^\d{4}-\d\d-\d\dT/);
});

test("saving over a board keeps its sharing unless told otherwise", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const { id } = await (await save({ request: post(board(), {}, "?shared=1"), env })).json();
  const keep = await (await update({ request: put(id, board({ title: "Renamed" })), params: { id }, env })).json();
  assert.equal(keep.shared, true);
  assert.equal((await (await pub(id, env)).json()).title, "Renamed");
  const off = await (await update({ request: put(id, board({ title: "Renamed" }), "?shared=0"), params: { id }, env })).json();
  assert.equal(off.shared, false);
  assert.equal((await pub(id, env)).status, 404);
  const on = await (await update({ request: put(id, board({ title: "Again" }), "?shared=1"), params: { id }, env })).json();
  assert.equal(on.shared, true);
});

test("boards saved before sharing existed have no flag and count as shared, so old links keep working", async () => {
  const env = { DIAGRAMS: fakeKv() };
  await env.DIAGRAMS.put("d:abcdefghijkl", JSON.stringify(board({ title: "Old link" })), { metadata: { title: "Old link", updated: "2026-11-13T07:04:01.709Z" } });
  assert.equal((await pub("abcdefghijkl", env)).status, 200);
  assert.deepEqual((await (await list({ env })).json()).items.map((i) => i.shared), [true]);
  // saving over it keeps it shared
  const res = await (await update({ request: put("abcdefghijkl", board()), params: { id: "abcdefghijkl" }, env })).json();
  assert.equal(res.shared, true);
});

test("delete removes it for everyone", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const { id } = await (await save({ request: post(board(), {}, "?shared=1"), env })).json();
  const del = await remove({ request: new Request(`${ORIGIN}/api/diagrams/${id}`, { method: "DELETE" }), params: { id }, env });
  assert.equal((await del.json()).deleted, true);
  assert.equal((await pub(id, env)).status, 404);
  assert.equal((await own(id, env)).status, 404);
  assert.deepEqual((await (await list({ env })).json()).items, []);
});

test("updating or sharing a board that does not exist is a 404, not a new board", async () => {
  const env = { DIAGRAMS: fakeKv() };
  assert.equal((await update({ request: put("abcdefghijkl", board()), params: { id: "abcdefghijkl" }, env })).status, 404);
  const res = await setShared({ request: new Request(`${ORIGIN}/api/diagrams/abcdefghijkl/shared`, { method: "POST", body: JSON.stringify({ shared: true }) }), params: { id: "abcdefghijkl" }, env });
  assert.equal(res.status, 404);
  assert.equal(env.DIAGRAMS.map.size, 0);
});

test("the share switch only accepts true or false", async () => {
  const env = { DIAGRAMS: fakeKv() };
  const { id } = await (await save({ request: post(board()), env })).json();
  for (const body of ["not json", JSON.stringify({}), JSON.stringify({ shared: "yes" }), JSON.stringify(null)]) {
    const res = await setShared({ request: new Request(`${ORIGIN}/api/diagrams/${id}/shared`, { method: "POST", body }), params: { id }, env });
    assert.equal(res.status, 400, body);
  }
  assert.equal((await pub(id, env)).status, 404);
});

test("bad ids never reach the store", async () => {
  const env = { DIAGRAMS: fakeKv() };
  for (const id of ["", "short", "UPPERCASE123", "has-dash-12345", "a".repeat(40), "../etc"]) {
    assert.equal((await pub(id, env)).status, 404, id);
    assert.equal((await own(id, env)).status, 404, id);
  }
});

test("rejects things that are not boards, and boards that are too big", async () => {
  const env = { DIAGRAMS: fakeKv() };
  assert.equal((await save({ request: post("not json"), env })).status, 400);
  assert.equal((await save({ request: post([1, 2]), env })).status, 400);
  assert.equal((await save({ request: post({ version: 2, nodes: [] }), env })).status, 400);
  assert.equal((await save({ request: post({ version: 1 }), env })).status, 400);
  const many = board({ nodes: Array.from({ length: 601 }, (_, i) => ({ id: "n" + i, gx: i, gy: 0, icon: "svc", label: "" })) });
  assert.equal((await save({ request: post(many), env })).status, 413);
  assert.equal((await save({ request: post(board({ steps: ["x".repeat(600 * 1024)] })), env })).status, 413);
  assert.equal(env.DIAGRAMS.map.size, 0);
});

test("a long or missing title is tidied", async () => {
  const env = { DIAGRAMS: fakeKv() };
  assert.equal((await (await save({ request: post(board({ title: "T".repeat(300) })), env })).json()).title.length, 120);
  assert.equal((await (await save({ request: post(board({ title: "  " })), env })).json()).title, "Untitled architecture");
});

test("writes that a browser says came from another site are refused", async () => {
  const env = { DIAGRAMS: fakeKv() };
  assert.equal((await save({ request: post(board(), { "Sec-Fetch-Site": "cross-site" }), env })).status, 403);
  assert.equal((await save({ request: post(board(), { Origin: "https://evil.example" }), env })).status, 403);
  assert.equal((await save({ request: post(board(), { "Sec-Fetch-Site": "same-origin", Origin: "https://projects.tanmoybh.com" }), env })).status, 201); // behind the hub
  assert.equal((await save({ request: post(board(), { Origin: ORIGIN }), env })).status, 201);
  const id = [...env.DIAGRAMS.map.keys()][0].slice(2);
  const cross = { "Sec-Fetch-Site": "cross-site" };
  assert.equal((await remove({ request: new Request(`${ORIGIN}/api/diagrams/${id}`, { method: "DELETE", headers: cross }), params: { id }, env })).status, 403);
  assert.equal((await update({ request: put(id, board(), "", cross), params: { id }, env })).status, 403);
  assert.equal((await setShared({ request: new Request(`${ORIGIN}/api/diagrams/${id}/shared`, { method: "POST", body: JSON.stringify({ shared: true }), headers: cross }), params: { id }, env })).status, 403);
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
