import type { Store } from "../model/store";
import { BoardInfo, ApiError, listBoards, setShared } from "../share/api";
import { packDoc } from "../share/codec";
import { saveCurrent } from "../share/library";
import { ViewOpts, ViewTheme, embedCode, packedLink, shortLink } from "../share/links";
import { copyText, openDialog } from "./dialog";
import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";
import { sharedPill } from "./saved";

export interface ShareCtx {
  store: Store;
  toast: (message: string, kind?: "info" | "error") => void;
}

const LONG_LINK = 8000;

/**
 * The Share window. It is an action, not a list: one button turns sharing on for this board, and then it shows the
 * link and the embed code. Boards that are shared or only saved are all listed under Saved.
 */
export function openShare(ctx: ShareCtx): void {
  const { store, toast } = ctx;
  const page = location.href;
  const opts: ViewOpts & { height: number } = { mode: "3d", play: true, theme: "auto", height: 520 };
  const viewOpts = (): ViewOpts => ({ mode: opts.mode, play: opts.play, theme: opts.theme });

  const button = (icon: keyof typeof UI_ICONS, label: string, onclick: () => void, extra = "") =>
    h("button", { class: "btn" + extra, type: "button", onclick }, svg(UI_ICONS[icon]), h("span", {}, label));
  const copy = async (text: string, what: string) => {
    const ok = await copyText(text);
    toast(ok ? `${what} copied.` : "Could not copy. Select the text and copy it yourself.", ok ? "info" : "error");
  };
  const section = (title: string, ...children: (Node | string | null)[]) => h("section", { class: "share-sec" }, h("h3", {}, title), ...children);

  // ---------------------------------------------------------------- options
  const modeSel = h("select", {}, h("option", { value: "3d" }, "3D"), h("option", { value: "2d" }, "2D"));
  const playChk = h("input", { type: "checkbox" });
  playChk.checked = true;
  const themeSel = h("select", {}, h("option", { value: "auto" }, "Match the visitor"), h("option", { value: "light" }, "Light"), h("option", { value: "dark" }, "Dark"));
  const heightIn = h("input", { type: "number", min: 200, max: 1600, step: 20 });
  heightIn.value = String(opts.height);
  const options = h("div", { class: "share-opts" },
    h("label", { class: "field" }, h("span", {}, "Starts as"), modeSel),
    h("label", { class: "field" }, h("span", {}, "Theme"), themeSel),
    h("label", { class: "field" }, h("span", {}, "Embed height (px)"), heightIn),
    h("label", { class: "check" }, playChk, h("span", {}, "Start turning (3D)")));

  // ---------------------------------------------------------- the share action
  const action = h("div", {});
  let info: BoardInfo | null = null;
  let state: "loading" | "ready" | "unavailable" | "error" = "loading";
  let errorText = "";
  let busy = false;

  const load = async () => {
    state = "loading"; renderAction();
    try {
      const all = await listBoards(page);
      info = all.find((b) => b.id === store.doc.boardId) ?? null;
      state = "ready";
    } catch (e) {
      state = e instanceof ApiError && e.unavailable ? "unavailable" : "error";
      errorText = e instanceof Error ? e.message : "Could not check the sharing status.";
    }
    renderAction();
  };

  const run = async (label: string, job: () => Promise<void>) => {
    if (busy) return;
    busy = true; renderAction();
    try { await job(); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : `Could not ${label}.`, "error"); }
    busy = false; renderAction();
  };

  function renderAction(): void {
    const disable = () => { for (const b of action.querySelectorAll("button")) (b as HTMLButtonElement).disabled = busy; };
    if (state === "loading") { action.replaceChildren(h("p", { class: "muted" }, "Checking.")); return; }
    if (state === "unavailable") {
      action.replaceChildren(h("p", { class: "muted" }, "Sharing a board with a link you can update needs the deployed site. The link below, which carries the diagram inside it, works anywhere."));
      return;
    }
    if (state === "error") { action.replaceChildren(h("p", { class: "muted" }, errorText), button("sparkle", "Try again", () => void load())); return; }

    if (!info?.shared) {
      action.replaceChildren(
        h("p", { class: "muted" }, "Sharing saves this board and gives anyone with the link a view-only copy: the real 3D models, a 3D and 2D switch, turn, zoom and full screen. Nobody can edit it. You can stop at any time."),
        button("share", busy ? "Sharing…" : "Share this board", () => run("share", async () => { await saveCurrent(page, store, true); toast("Shared. Copy the link."); }), " primary"));
      disable();
      return;
    }
    const link = shortLink(page, info.id, viewOpts());
    action.replaceChildren(
      h("div", { class: "saved-name" }, sharedPill(), h("span", { class: "muted" }, "Anyone with this link can view it. It is also in your Saved boards.")),
      h("input", { type: "text", readonly: true, class: "share-link", value: link, "aria-label": "Short link" }),
      h("div", {},
        button("copy", "Copy link", () => copy(link, "Link")),
        button("copy", "Copy embed code", () => copy(embedCode(link, store.doc.title, opts.height), "Embed code")),
        button("share", "Open", () => window.open(link, "_blank", "noopener")),
        button("sparkle", busy ? "Working…" : "Update the shared version", () => run("update", async () => { await saveCurrent(page, store); toast("The link now shows this version. It can take half a minute to appear everywhere."); }), " primary"),
        button("trash", "Stop sharing", () => run("stop sharing", async () => { await setShared(page, info!.id, false); toast("No longer shared. The board is still saved."); }), " danger")));
    disable();
  }

  // ---------------------------------------------- link that holds the diagram
  const linkBox = h("input", { type: "text", readonly: true, class: "share-link", "aria-label": "Link that holds the diagram" });
  const linkNote = h("p", { class: "muted" }, "Making the link.");
  let packedUrl = "";
  const refreshLink = async () => {
    try {
      packedUrl = packedLink(page, await packDoc(store.doc), viewOpts());
      linkBox.value = packedUrl;
      linkNote.textContent = packedUrl.length > LONG_LINK
        ? `${packedUrl.length.toLocaleString()} characters is long for a link. Share it above for a short one.`
        : `${packedUrl.length.toLocaleString()} characters. The diagram travels inside the link, so nothing is stored anywhere. Changing the board later means sharing a new link.`;
    } catch (e) {
      packedUrl = ""; linkBox.value = "";
      linkNote.textContent = e instanceof Error ? e.message : "Could not make the link.";
    }
  };
  const quick = section("Or a link that holds the diagram",
    linkBox,
    h("div", {},
      button("copy", "Copy link", () => packedUrl && copy(packedUrl, "Link")),
      button("copy", "Copy embed code", () => packedUrl && copy(embedCode(packedUrl, store.doc.title, opts.height), "Embed code")),
      button("share", "Open", () => packedUrl && window.open(packedUrl, "_blank", "noopener"))),
    linkNote);

  // -------------------------------------------------------------------- wire
  const changed = () => { void refreshLink(); renderAction(); };
  modeSel.addEventListener("change", () => { opts.mode = modeSel.value === "2d" ? "2d" : "3d"; changed(); });
  themeSel.addEventListener("change", () => { opts.theme = themeSel.value as ViewTheme; changed(); });
  playChk.addEventListener("change", () => { opts.play = playChk.checked; changed(); });
  heightIn.addEventListener("change", () => { opts.height = Math.min(1600, Math.max(200, Number(heightIn.value) || 520)); heightIn.value = String(opts.height); changed(); });

  openDialog("Share this board", h("div", { class: "share" }, section("Share", action), options, quick));
  void refreshLink();
  void load();
}
