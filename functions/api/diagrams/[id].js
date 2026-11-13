// Owner routes (behind the passphrase gate): read, update or remove one saved board.
import { ID_RE, isShared, json, keyFor, metaFor, notSetUp, readBoard, sameSite, sharedParam, store } from "../../../server/diagrams.js";

/** The owner's read: works whether or not the board is shared. */
export async function onRequestGet({ params, env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  const id = String(params.id || "");
  if (!ID_RE.test(id)) return json({ error: "Not found." }, 404);
  const text = await kv.get(keyFor(id));
  if (text === null) return json({ error: "Not found." }, 404);
  return new Response(text, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/** Save over an existing board. Sharing stays as it was unless the request says ?shared=1 or ?shared=0. */
export async function onRequestPut({ request, params, env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  if (!sameSite(request)) return json({ error: "Cross site requests are not allowed." }, 403);
  const id = String(params.id || "");
  if (!ID_RE.test(id)) return json({ error: "Not found." }, 404);
  const { value, metadata } = await kv.getWithMetadata(keyFor(id));
  if (value === null) return json({ error: "That board no longer exists." }, 404);
  const board = await readBoard(request);
  if (!board.ok) return board.response;
  const shared = sharedParam(request) ?? isShared(metadata);
  await kv.put(keyFor(id), board.text, { metadata: metaFor(board.title, shared) });
  return json({ id, title: board.title, shared });
}

export async function onRequestDelete({ request, params, env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  if (!sameSite(request)) return json({ error: "Cross site requests are not allowed." }, 403);
  const id = String(params.id || "");
  if (!ID_RE.test(id)) return json({ error: "Not found." }, 404);
  await kv.delete(keyFor(id));
  return json({ id, deleted: true });
}
