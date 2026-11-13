// Owner routes (behind the passphrase gate): update or remove a published board.
import { ID_RE, json, keyFor, notSetUp, readBoard, sameSite, store } from "../../../server/diagrams.js";

export async function onRequestPut({ request, params, env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  if (!sameSite(request)) return json({ error: "Cross site requests are not allowed." }, 403);
  const id = String(params.id || "");
  if (!ID_RE.test(id)) return json({ error: "Not found." }, 404);
  if ((await kv.get(keyFor(id))) === null) return json({ error: "That link no longer exists." }, 404);
  const board = await readBoard(request);
  if (!board.ok) return board.response;
  await kv.put(keyFor(id), board.text, { metadata: { title: board.title, updated: new Date().toISOString() } });
  return json({ id, title: board.title });
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
