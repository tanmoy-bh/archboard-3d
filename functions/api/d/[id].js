// Public read of a shared board: GET /api/d/<id>. Anyone with the id can read it if the owner has shared it; a board
// that is only saved answers 404, exactly like one that does not exist. There is no listing.
import { ID_RE, isShared, json, keyFor, notSetUp, store } from "../../../server/diagrams.js";

export async function onRequestGet({ params, env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  const id = String(params.id || "");
  if (!ID_RE.test(id)) return json({ error: "Not found." }, 404);
  const { value, metadata } = await kv.getWithMetadata(keyFor(id));
  if (value === null || !isShared(metadata)) return json({ error: "Not found." }, 404);
  return new Response(value, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30",
      "Access-Control-Allow-Origin": "*",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
