import { boldRuns, parseNotes } from "../model/notes";
import type { Store } from "../model/store";
import { NOTES_MAX } from "../model/types";
import { h, isTypingTarget, svg } from "./dom";
import { UI_ICONS } from "./icons";

/** A reading view for a board's explanation, laid over the canvas, and the button that opens it. Used by the editor and the viewer. */
export class ExplanationReader {
  readonly button: HTMLButtonElement;
  readonly panel: HTMLDialogElement;
  private body = h("div", { class: "explain-body", tabindex: 0 });
  private nav = h("nav", { class: "explain-nav", "aria-label": "Sections" });
  private title = h("strong", {});
  private shown: string | null = null;

  constructor() {
    this.button = h("button", { class: "explain-open", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", hidden: true, onclick: () => this.setOpen(true) }, svg(UI_ICONS.list), h("span", {}, "Explanation"));
    // Not a modal dialog: it covers the canvas only, so the toolbar and side panels stay usable. On a phone the styles make it fill the screen.
    this.panel = h("dialog", { class: "explain", "aria-label": "Explanation" },
      h("div", { class: "explain-head" }, this.title,
        h("button", { class: "tb", type: "button", title: "Close the explanation (Esc)", "aria-label": "Close the explanation", onclick: () => this.setOpen(false) }, svg(UI_ICONS.close))),
      this.nav, this.body);
    // While it is open, shortcuts must not edit or move the board hidden behind it. Typing, scrolling and Tab still work,
    // Escape closes it, and a dialog in front keeps its own keys.
    window.addEventListener("keydown", (e) => {
      if (!this.open || document.querySelector(".modal") || isTypingTarget(e.target)) return;
      e.stopPropagation();
      if (e.key !== "Escape") return;
      e.preventDefault();
      this.setOpen(false);
    }, true);
  }

  get open(): boolean { return this.panel.open; }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.button.setAttribute("aria-expanded", String(open));
    if (open) {
      this.panel.show();
      this.body.focus(); // so the arrow and page keys scroll straight away
      return;
    }
    const hadFocus = this.panel.contains(document.activeElement);
    this.panel.close();
    if (hadFocus) this.button.focus();
  }

  /** Show this board's explanation. A board without one has no button and no panel. */
  update(title: string, notes: string | undefined): void {
    const text = notes?.trim() ?? "";
    this.button.hidden = !text;
    this.title.textContent = title.trim() || "Untitled";
    if (!text) this.setOpen(false);
    if (text === this.shown) return;
    this.shown = text;

    const sections: HTMLElement[] = [];
    const line = (tag: "h2" | "h3" | "p" | "li", s: string) =>
      h(tag, {}, ...boldRuns(s).map((r) => (r.bold ? h("b", {}, r.text) : r.text)));
    this.body.replaceChildren(...parseNotes(text).map((b) => {
      if (b.kind === "ul") return h("ul", {}, ...b.items.map((i) => line("li", i)));
      const el = line(b.kind, b.text);
      if (b.kind === "h2") sections.push(el);
      return el;
    }));
    this.nav.replaceChildren(...sections.map((el) =>
      h("button", { type: "button", onclick: () => el.scrollIntoView({ block: "start" }) }, el.textContent ?? "")));
    this.nav.hidden = sections.length < 2;
    this.body.scrollTop = 0;
  }
}

/** Right panel section where the explanation is written. */
export class ExplanationEditor {
  readonly el: HTMLElement;
  private area: HTMLTextAreaElement;

  constructor(private store: Store) {
    this.area = h("textarea", { rows: 7, spellcheck: true, maxlength: NOTES_MAX, placeholder: "## Section\nPlain text, - bullets and **bold** words.", "aria-label": "Explanation text" });
    this.area.addEventListener("input", () => {
      const text = this.area.value;
      this.store.mutate((d) => { if (text.trim()) d.notes = text; else delete d.notes; }, "notes");
    });
    this.el = h("section", { class: "steps" },
      h("h2", {}, "Explanation"),
      h("p", { class: "muted" }, "The longer story: why it is built this way and what it costs. Open it from the button under the board name."),
      this.area);
    this.update();
  }

  update(): void {
    if (document.activeElement !== this.area) this.area.value = this.store.doc.notes ?? "";
  }
}
