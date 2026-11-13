// Owner routes (behind the passphrase gate): list every saved board, and save a new one.
import { isShared, json, keyFor, metaFor, newId, notSetUp, readBoard, sameSite, sharedParam, store } from "../../../server/diagrams.js";

export async function onRequestGet({ env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  const items = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await kv.list({ prefix: "d:", limit: 1000, cursor });
    for (const k of res.keys) items.push({ id: k.name.slice(2), title: k.metadata?.title ?? "", updated: k.metadata?.updated ?? "", shared: isShared(k.metadata) });
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  items.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  return json({ items });
}

/** Save a new board. It is private unless the request says ?shared=1. */
export async function onRequestPost({ request, env }) {
  const kv = store(env);
  if (!kv) return notSetUp();
  if (!sameSite(request)) return json({ error: "Cross site requests are not allowed." }, 403);
  const board = await readBoard(request);
  if (!board.ok) return board.response;
  const id = newId();
  const shared = sharedParam(request) ?? false;
  await kv.put(keyFor(id), board.text, { metadata: metaFor(board.title, shared) });
  return json({ id, title: board.title, shared }, 201);
}
