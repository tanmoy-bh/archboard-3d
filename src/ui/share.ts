import type { Store } from "../model/store";
import { parseDoc } from "../model/serialize";
import type { DocData } from "../model/types";
import { Published, fetchPublishedText, listPublished, publish, unpublish, updatePublished } from "../share/api";
import { packDoc } from "../share/codec";
import { ViewOpts, ViewTheme, embedCode, packedLink, shortLink } from "../share/links";
import { copyText, openDialog } from "./dialog";
import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";

export interface ShareCtx {
  store: Store;
  toast: (message: string, kind?: "info" | "error") => void;
  /** Put a published board on the editor, replacing the current one (the caller confirms and keeps undo). */
  openDoc: (doc: DocData) => void;
}

const LONG_LINK = 8000;

/** The Share window: a link that carries the diagram, a short link you can update, and embed code for both. */
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

  // ---------------------------------------------------- link that holds the board
  const linkBox = h("input", { type: "text", readonly: true, class: "share-link", "aria-label": "Link that holds the diagram" });
  const linkNote = h("p", { class: "muted" }, "Making the link.");
  let packedUrl = "";
  const refreshLink = async () => {
    try {
      packedUrl = packedLink(page, await packDoc(store.doc), viewOpts());
      linkBox.value = packedUrl;
      linkNote.textContent = packedUrl.length > LONG_LINK
        ? `${packedUrl.length.toLocaleString()} characters is long for a link. Publish it below for a short one.`
        : `${packedUrl.length.toLocaleString()} characters. The diagram travels inside the link, so nothing is stored anywhere. Changing the board later means sharing a new link.`;
    } catch (e) {
      packedUrl = "";
      linkBox.value = "";
      linkNote.textContent = e instanceof Error ? e.message : "Could not make the link.";
    }
  };
  const quick = section("Link that holds the diagram",
    linkBox,
    h("div", {},
      button("copy", "Copy link", () => packedUrl && copy(packedUrl, "Link")),
      button("copy", "Copy embed code", () => packedUrl && copy(embedCode(packedUrl, store.doc.title, opts.height), "Embed code")),
      button("share", "Open", () => packedUrl && window.open(packedUrl, "_blank", "noopener"))),
    linkNote);

  // ----------------------------------------------------------- published link
  const pub = h("div", {});
  const pubSection = section("Short link you can update", pub);
  let busy = false;
  const renderPub = () => {
    const id = store.doc.shareId;
    const run = async (label: string, job: () => Promise<void>) => {
      if (busy) return;
      busy = true; renderPub();
      try { await job(); } catch (e) { toast(e instanceof Error ? e.message : `Could not ${label}.`, "error"); }
      busy = false; renderPub(); void renderList();
    };
    if (!id) {
      pub.replaceChildren(
        h("p", { class: "muted" }, "Publish the board to get a short link such as …/v/ab12cd34ef56. The link stays the same when you publish changes, so an embed never needs editing. Anyone with the link can view it, nobody can edit it."),
        button("share", busy ? "Publishing…" : "Publish", () => run("publish", async () => {
          const newId = await publish(page, store.doc);
          store.setShareId(newId);
          toast("Published. Copy the link below.");
        }), " primary"));
      (pub.querySelector("button") as HTMLButtonElement).disabled = busy;
      return;
    }
    const link = shortLink(page, id, viewOpts());
    const box = h("input", { type: "text", readonly: true, class: "share-link", value: link, "aria-label": "Short link" });
    const row = h("div", {},
      button("copy", "Copy link", () => copy(link, "Link")),
      button("copy", "Copy embed code", () => copy(embedCode(link, store.doc.title, opts.height), "Embed code")),
      button("share", "Open", () => window.open(link, "_blank", "noopener")),
      button("sparkle", busy ? "Working…" : "Update this link", () => run("update", async () => { await updatePublished(page, id, store.doc); toast("The link now shows this version (it can take half a minute to appear everywhere)."); }), " primary"),
      button("trash", "Unpublish", () => run("unpublish", async () => {
        if (!confirm("Unpublish this board? The link and any embed of it stop working.")) return;
        await unpublish(page, id);
        store.setShareId(undefined);
        toast("Unpublished.");
      }), " danger"));
    for (const b of row.querySelectorAll("button")) (b as HTMLButtonElement).disabled = busy;
    pub.replaceChildren(
      box, row,
      h("p", { class: "muted" }, "This board was published. Editing it here does not change the link until you press Update. "),
      button("share", "Publish as a new link instead", () => run("publish", async () => { store.setShareId(await publish(page, store.doc)); toast("Published as a new link."); })));
  };

  // ------------------------------------------------------- everything published
  const list = h("div", { class: "pub-list" }, h("p", { class: "muted" }, "Loading."));
  const listSection = section("Published boards", list);
  const renderList = async () => {
    let items: Published[];
    try { items = await listPublished(page); }
    catch (e) { list.replaceChildren(h("p", { class: "muted" }, e instanceof Error ? e.message : "Could not load the list.")); return; }
    if (!items.length) { list.replaceChildren(h("p", { class: "muted" }, "Nothing is published yet.")); return; }
    list.replaceChildren(...items.map((it) => h("div", { class: "pub-row" },
      h("div", { class: "pub-title" }, h("strong", {}, it.title || "Untitled"), h("span", { class: "muted" }, it.updated ? new Date(it.updated).toLocaleString() : "")),
      h("div", { class: "pub-actions" },
        button("open" as keyof typeof UI_ICONS, "Edit", async () => {
          if (store.itemCount > 0 && !confirm(`Replace the board with "${it.title}"? Undo brings the current one back.`)) return;
          try { const doc = parseDoc(await fetchPublishedText(page, it.id)); doc.shareId = it.id; ctx.openDoc(doc); dlg.close(); }
          catch (e) { toast(e instanceof Error ? e.message : "Could not open it.", "error"); }
        }),
        button("copy", "Copy link", () => copy(shortLink(page, it.id, viewOpts()), "Link")),
        button("trash", "Delete", async () => {
          if (!confirm(`Delete "${it.title}"? Its link and any embed of it stop working.`)) return;
          try { await unpublish(page, it.id); if (store.doc.shareId === it.id) store.setShareId(undefined); toast("Deleted."); renderPub(); void renderList(); }
          catch (e) { toast(e instanceof Error ? e.message : "Could not delete it.", "error"); }
        }, " danger")))));
  };

  // -------------------------------------------------------------------- wire
  const changed = () => { void refreshLink(); renderPub(); };
  modeSel.addEventListener("change", () => { opts.mode = modeSel.value === "2d" ? "2d" : "3d"; changed(); });
  themeSel.addEventListener("change", () => { opts.theme = themeSel.value as ViewTheme; changed(); });
  playChk.addEventListener("change", () => { opts.play = playChk.checked; changed(); });
  heightIn.addEventListener("change", () => { opts.height = Math.min(1600, Math.max(200, Number(heightIn.value) || 520)); heightIn.value = String(opts.height); changed(); });

  const body = h("div", { class: "share" },
    h("p", { class: "muted" }, "Anyone with a link can look at the diagram in 3D or 2D, turn it and pan around. They cannot change it. Links work inside other pages as an embed."),
    options, quick, pubSection, listSection);
  const dlg = openDialog("Share this board", body);
  void refreshLink();
  renderPub();
  void renderList();
}
