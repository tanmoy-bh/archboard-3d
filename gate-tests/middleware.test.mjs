import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/_middleware.js";

const ORIGIN = "https://tanmoybh-archboard-3d.pages.dev";
const env = { ACCESS_PASSPHRASE: "correct horse" };
const app = () => new Response("<h1>app</h1>", { headers: { "Content-Type": "text/html" } });
const call = (path, init = {}, e = env) => onRequest({ request: new Request(ORIGIN + path, init), env: e, next: async () => app() });
const form = (p) => { const f = new FormData(); f.set("passphrase", p); return f; };

test("shows the lock screen without a cookie", async () => {
  const res = await call("/");
  assert.equal(res.status, 401);
  const html = await res.text();
  assert.match(html, /action="__auth"/);
  assert.doesNotMatch(html, /<h1>app<\/h1>/);
  assert.doesNotMatch(html, /correct horse/);
});

test("rejects a wrong passphrase", async () => {
  const res = await call("/__auth", { method: "POST", body: form("nope") });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Set-Cookie"), null);
  assert.match(await res.text(), /not right/);
});

test("accepts the passphrase, sets a cookie and the cookie opens the app", async () => {
  const res = await call("/__auth", { method: "POST", body: form("correct horse") });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("Location"), ORIGIN + "/");
  const cookie = res.headers.get("Set-Cookie");
  assert.match(cookie, /^ab_access=[0-9a-f]{64};/);
  assert.match(cookie, /HttpOnly/);
  assert.doesNotMatch(cookie, /Path=/); // browser scopes it to /archboard-3d behind the hub
  const value = cookie.split(";")[0];
  const ok = await call("/", { headers: { Cookie: value } });
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "<h1>app</h1>");
  assert.equal(ok.headers.get("Cache-Control"), "private, no-store");
});

test("a forged cookie does not open the app", async () => {
  const res = await call("/", { headers: { Cookie: "ab_access=" + "0".repeat(64) } });
  assert.equal(res.status, 401);
});

test("changing the passphrase invalidates old cookies", async () => {
  const res = await call("/__auth", { method: "POST", body: form("correct horse") });
  const value = res.headers.get("Set-Cookie").split(";")[0];
  const after = await call("/", { headers: { Cookie: value } }, { ACCESS_PASSPHRASE: "new phrase" });
  assert.equal(after.status, 401);
});

test("logout clears the cookie", async () => {
  const res = await call("/__logout");
  assert.equal(res.status, 303);
  assert.match(res.headers.get("Set-Cookie"), /Max-Age=0/);
});

test("fails closed when the secret is missing", async () => {
  const res = await call("/", {}, {});
  assert.equal(res.status, 503);
});

test("favicon is public so the lock screen can show it", async () => {
  const res = await call("/favicon.svg");
  assert.equal(res.status, 200);
});

test("the viewer, its scripts, example files, board reads and short links are public for reads", async () => {
  for (const path of ["/view/", "/view", "/view/?id=abcdefghijkl", "/assets/view-abc.js", "/diagrams/index.json", "/diagrams/ticketing.json", "/api/d/abcdefghijkl", "/v/abcdefghijkl"]) {
    const res = await call(path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow", path);
    assert.equal(await res.text(), "<h1>app</h1>", path);
  }
  const head = await call("/view/", { method: "HEAD" });
  assert.equal(head.status, 200);
});

test("the editor, the owner's routes and every write stay behind the passphrase", async () => {
  for (const path of ["/", "/index.html", "/api/diagrams", "/api/diagrams/abcdefghijkl", "/api/diagrams/abcdefghijkl/shared", "/api/dx", "/viewer", "/views/", "/diagramsx/a.json"]) {
    const res = await call(path);
    assert.equal(res.status, 401, path);
  }
  for (const [method, path] of [["POST", "/api/d/abcdefghijkl"], ["PUT", "/api/diagrams/abcdefghijkl"], ["DELETE", "/api/diagrams/abcdefghijkl"], ["POST", "/api/diagrams"], ["POST", "/api/diagrams/abcdefghijkl/shared"], ["POST", "/v/abcdefghijkl"]]) {
    const res = await call(path, { method, body: "{}" });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test("a public response is not forced to be uncacheable or framed", async () => {
  const res = await onRequest({ request: new Request(ORIGIN + "/view/"), env, next: async () => new Response("x", { headers: { "Cache-Control": "public, max-age=30" } }) });
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=30");
  assert.equal(res.headers.get("X-Frame-Options"), null);
  assert.equal(res.headers.get("Content-Security-Policy"), null);
});
