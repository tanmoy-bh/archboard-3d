// Owner route (behind the passphrase gate): start or stop sharing a saved board without touching its content.
import { ID_RE, json, keyFor, metaFor, notSetUp, sameSite, store } from "../../../../server/diagrams.js";

export async function onRequestPost({ request, params, env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  if (!sameSite(request)) return json({ error: "Cross site requests are not allowed." }, 403);
  const id = String(params.id || "");
  if (!ID_RE.test(id)) return json({ error: "Not found." }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Send {\"shared\": true} or {\"shared\": false}." }, 400); }
  if (!body || typeof body.shared !== "boolean") return json({ error: "Send {\"shared\": true} or {\"shared\": false}." }, 400);
  const { value, metadata } = await kv.getWithMetadata(keyFor(id));
  if (value === null) return json({ error: "That board no longer exists." }, 404);
  await kv.put(keyFor(id), value, { metadata: { ...metaFor(metadata?.title ?? "", body.shared), updated: metadata?.updated ?? new Date().toISOString() } });
  return json({ id, shared: body.shared });
}
