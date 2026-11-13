import { parseDoc } from "../model/serialize";
import type { Store } from "../model/store";
import type { DocData } from "../model/types";
import { ApiError, BoardInfo, deleteBoard, listBoards, readBoard } from "../share/api";
import { saveCurrent } from "../share/library";
import { shortLink } from "../share/links";
import { copyText, openDialog } from "./dialog";
import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";

export interface SavedCtx {
  store: Store;
  toast: (message: string, kind?: "info" | "error") => void;
  /** Put a saved board on the editor, replacing the current one (undoable). */
  openDoc: (doc: DocData) => void;
  /** Download the board in the editor as a file. */
  downloadFile: () => void;
}

/** A small "Shared" pill, used wherever a board that has a public link is listed. */
export const sharedPill = (): HTMLElement => h("span", { class: "pill shared", title: "Anyone with the link can view this board" }, svg(UI_ICONS.globeOn), "Shared");

/** The list of every saved board, shared or not. Shared ones carry a pill. */
export function openSaved(ctx: SavedCtx): void {
  const { store, toast } = ctx;
  const page = location.href;
  const list = h("div", { class: "saved-list" }, h("p", { class: "muted" }, "Loading your saved boards."));

  const button = (icon: keyof typeof UI_ICONS, label: string, onclick: () => void, extra = "") =>
    h("button", { class: "btn" + extra, type: "button", onclick }, svg(UI_ICONS[icon]), h("span", {}, label));
  const fail = (e: unknown, what: string) => toast(e instanceof Error ? e.message : `Could not ${what}.`, "error");

  const render = async () => {
    let items: BoardInfo[];
    try { items = await listBoards(page); }
    catch (e) {
      const dev = e instanceof ApiError && e.unavailable;
      list.replaceChildren(h("p", { class: "muted" }, dev ? "Saved boards live on the deployed site. Here, use Download as a file." : e instanceof Error ? e.message : "Could not load the list."));
      return;
    }
    if (!items.length) { list.replaceChildren(h("p", { class: "muted" }, "Nothing is saved yet. Press Save this board to keep the one you are working on.")); return; }
    list.replaceChildren(...items.map((it) => h("div", { class: "saved-row" + (it.id === store.doc.boardId ? " current" : "") },
      h("div", { class: "saved-title" },
        h("div", { class: "saved-name" }, h("strong", {}, it.title || "Untitled"), it.shared ? sharedPill() : null, it.id === store.doc.boardId ? h("span", { class: "pill now" }, "Open now") : null),
        h("span", { class: "muted" }, it.updated ? `Saved ${new Date(it.updated).toLocaleString()}` : "")),
      h("div", { class: "pub-actions" },
        button("open", "Open", async () => {
          try { const doc = parseDoc(await readBoard(page, it.id)); doc.boardId = it.id; ctx.openDoc(doc); dlg.close(); toast(`Opened "${doc.title}". Undo brings your previous board back.`); }
          catch (e) { fail(e, "open it"); }
        }),
        it.shared ? button("copy", "Copy link", async () => toast((await copyText(shortLink(page, it.id))) ? "Link copied." : "Could not copy the link.")) : null,
        button("trash", "Delete", async () => {
          if (!confirm(it.shared ? `Delete "${it.title}"? It is shared, so its link and any embed of it stop working.` : `Delete "${it.title}"? This cannot be undone.`)) return;
          try { await deleteBoard(page, it.id); if (store.doc.boardId === it.id) store.setBoardId(undefined); toast("Deleted."); void render(); }
          catch (e) { fail(e, "delete it"); }
        }, " danger")))));
  };

  const save = button("library", "Save this board", async () => {
    try {
      const { created } = await saveCurrent(page, store);
      toast(created ? "Saved. It is private until you share it." : "Saved over the earlier version.");
      void render();
    } catch (e) { fail(e, "save"); }
  }, " primary");

  const body = h("div", { class: "saved" },
    h("p", { class: "muted" }, "Every board you save is kept here, private to you until you share it. Boards with a link that anyone can open show a Shared pill."),
    h("div", {}, save, button("save", "Download as a file", () => ctx.downloadFile())),
    list);
  const dlg = openDialog("Saved boards", body);
  void render();
}
