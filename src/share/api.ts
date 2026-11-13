import type { DocData } from "../model/types";

/** One saved board in the owner's list. */
export interface BoardInfo { id: string; title: string; updated: string; shared: boolean }

/** A failed call. `status` is the HTTP status, or 0 when the server could not be reached or is not there at all. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, /** True when there is no board API here, as in development. */ readonly unavailable = false) { super(message); }
}

/** Where the board routes live, relative to the editor page (works under any path prefix). */
const url = (pageHref: string, path: string) => new URL(path, pageHref).toString();

/**
 * Talk to the board routes. Every failure becomes an ApiError with a sentence that can be shown as it is. In
 * development there are no routes: the dev server answers with the editor page, which is not JSON.
 */
async function call(pageHref: string, path: string, init?: RequestInit): Promise<{ body: Record<string, unknown>; text: string }> {
  let res: Response;
  try { res = await fetch(url(pageHref, path), { credentials: "same-origin", ...init }); }
  catch { throw new ApiError("Could not reach the server. Check your connection.", 0); }
  if (res.status === 401) throw new ApiError("Your session has expired. Reload the page and enter the passphrase again.", 401);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new ApiError("Saved boards are only available on the deployed site.", 0, true);
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not an object */ }
  if (!res.ok) throw new ApiError(typeof body.error === "string" ? body.error : `The server said no (error ${res.status}).`, res.status);
  return { body, text };
}

const json = (doc: DocData): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) });
const flag = (shared: boolean | undefined) => (shared === undefined ? "" : shared ? "?shared=1" : "?shared=0");

export const listBoards = async (page: string): Promise<BoardInfo[]> => ((await call(page, "api/diagrams")).body.items as BoardInfo[]) ?? [];
/** Save a new board. Private unless `shared` is true. Returns its id. */
export const createBoard = async (page: string, doc: DocData, shared = false): Promise<string> =>
  (await call(page, `api/diagrams${flag(shared)}`, { method: "POST", ...json(doc) })).body.id as string;
/** Save over a board. Sharing stays as it was unless `shared` is given. */
export const saveBoard = async (page: string, id: string, doc: DocData, shared?: boolean): Promise<void> => {
  await call(page, `api/diagrams/${id}${flag(shared)}`, { method: "PUT", ...json(doc) });
};
export const setShared = async (page: string, id: string, shared: boolean): Promise<void> => {
  await call(page, `api/diagrams/${id}/shared`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shared }) });
};
export const deleteBoard = async (page: string, id: string): Promise<void> => { await call(page, `api/diagrams/${id}`, { method: "DELETE" }); };
/** The owner's read of a saved board's text, shared or not. */
export const readBoard = async (page: string, id: string): Promise<string> => (await call(page, `api/diagrams/${id}`)).text;
