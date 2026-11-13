// Public read of a published board: GET /api/d/<id>. Anyone with the id can read it; there is no listing.
import { ID_RE, json, keyFor, notSetUp, store } from "../../../server/diagrams.js";

export async function onRequestGet({ params, env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  const id = String(params.id || "");
  if (!ID_RE.test(id)) return json({ error: "Not found." }, 404);
  const text = await kv.get(keyFor(id));
  if (text === null) return json({ error: "Not found." }, 404);
  return new Response(text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30",
      "Access-Control-Allow-Origin": "*",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
