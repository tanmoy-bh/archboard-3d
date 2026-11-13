import type { DocData } from "../model/types";

export interface Published { id: string; title: string; updated: string }

/** Where the publish routes live, relative to the editor page (works under any path prefix). */
const url = (pageHref: string, path: string) => new URL(path, pageHref).toString();

/**
 * Talk to the publish routes. Every failure becomes an Error with a sentence that can be shown as it is. In
 * development there are no routes: the dev server answers with the editor page, which is not JSON.
 */
async function call(pageHref: string, path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try { res = await fetch(url(pageHref, path), { credentials: "same-origin", ...init }); }
  catch { throw new Error("Could not reach the server. Check your connection."); }
  if (res.status === 401) throw new Error("Your session has expired. Reload the page and enter the passphrase again.");
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error("Publishing is only available on the deployed site.");
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `The server said no (error ${res.status}).`);
  return body;
}

const json = (doc: DocData): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) });

export const listPublished = async (page: string): Promise<Published[]> => ((await call(page, "api/diagrams")) as { items: Published[] }).items;
export const publish = async (page: string, doc: DocData): Promise<string> => ((await call(page, "api/diagrams", { method: "POST", ...json(doc) })) as { id: string }).id;
export const updatePublished = async (page: string, id: string, doc: DocData): Promise<void> => { await call(page, `api/diagrams/${id}`, { method: "PUT", ...json(doc) }); };
export const unpublish = async (page: string, id: string): Promise<void> => { await call(page, `api/diagrams/${id}`, { method: "DELETE" }); };
export const fetchPublishedText = async (page: string, id: string): Promise<string> => {
  const res = await fetch(url(page, `api/d/${id}`));
  if (!res.ok) throw new Error("That diagram could not be loaded.");
  return res.text();
};
