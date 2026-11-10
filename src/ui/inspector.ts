import { ICON_NAMES } from "../glyphs/catalog";
import type { Store } from "../model/store";
import { ICON_KEYS, IconKey, TEXT_MAX_LENGTH, TEXT_SIZES, TEXT_SIZE_NAMES, isIconKey, isTextSize, snap } from "../model/types";
import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";

type Refresher = () => void;

/** Right panel: edit whatever is selected. Falls back to board settings when nothing is. */
export class Inspector {
  readonly el: HTMLElement;
  private body = h("div", { class: "inspector-body" });
  private refreshers: Refresher[] = [];
  private signature = "";
  private focusTarget: HTMLInputElement | HTMLTextAreaElement | null = null;

  constructor(private store: Store) {
    this.el = h("section", { class: "inspector", "aria-label": "Inspector" }, h("h2", {}, "Inspector"), this.body);
    this.render();
  }

  /** Called on selection or document changes. */
  update(): void {
    const sig = this.signatureNow();
    if (sig !== this.signature) this.render();
    else for (const r of this.refreshers) r();
  }

  focusLabel(): void { this.focusTarget?.focus(); this.focusTarget?.select(); }

  private signatureNow(): string {
    const sel = [...this.store.selection].sort();
    const kind = sel.length === 1 ? (this.store.node(sel[0]) ? "n" : this.store.edge(sel[0]) ? "e" : this.store.textBox(sel[0]) ? "t" : "x") : "";
    return `${sel.join(",")}|${kind}`;
  }

  private render(): void {
    this.signature = this.signatureNow();
    this.refreshers = [];
    this.focusTarget = null;
    const sel = [...this.store.selection];
    this.body.replaceChildren();

    if (sel.length === 0) return this.renderBoard();
    if (sel.length > 1) return this.renderMulti(sel.length);
    if (this.store.node(sel[0])) return this.renderNode(sel[0]);
    if (this.store.edge(sel[0])) return this.renderEdge(sel[0]);
    if (this.store.textBox(sel[0])) return this.renderText(sel[0]);
  }

  // ------------------------------------------------------------- field helpers

  private field(label: string, input: HTMLElement): HTMLElement {
    return h("label", { class: "field" }, h("span", {}, label), input);
  }

  private text(get: () => string, set: (v: string) => void, placeholder = ""): HTMLInputElement {
    const el = h("input", { type: "text", placeholder, spellcheck: false });
    el.value = get();
    el.addEventListener("input", () => set(el.value));
    this.refreshers.push(() => { if (document.activeElement !== el) el.value = get(); });
    return el;
  }

  private area(get: () => string, set: (v: string) => void, placeholder = ""): HTMLTextAreaElement {
    const el = h("textarea", { rows: 4, placeholder, spellcheck: false, maxlength: TEXT_MAX_LENGTH });
    el.value = get();
    el.addEventListener("input", () => set(el.value));
    this.refreshers.push(() => { if (document.activeElement !== el) el.value = get(); });
    return el;
  }

  private number(get: () => number | undefined, set: (v: number | undefined) => void, step: number, min?: number): HTMLInputElement {
    const el = h("input", { type: "number", step, min });
    el.value = get() === undefined ? "" : String(get());
    el.addEventListener("change", () => {
      const raw = el.value.trim();
      set(raw === "" ? undefined : Number(raw));
      el.value = get() === undefined ? "" : String(get());
    });
    this.refreshers.push(() => { if (document.activeElement !== el) el.value = get() === undefined ? "" : String(get()); });
    return el;
  }

  private check(label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
    const el = h("input", { type: "checkbox" });
    el.checked = get();
    el.addEventListener("change", () => set(el.checked));
    this.refreshers.push(() => { el.checked = get(); });
    return h("label", { class: "check" }, el, h("span", {}, label));
  }

  private action(icon: keyof typeof UI_ICONS, label: string, onclick: () => void, danger = false): HTMLButtonElement {
    return h("button", { class: "btn" + (danger ? " danger" : ""), type: "button", onclick }, svg(UI_ICONS[icon]), h("span", {}, label));
  }

  // ------------------------------------------------------------------ panels

  private renderBoard(): void {
    const title = this.text(() => this.store.doc.title, (v) => this.store.mutate((d) => { d.title = v; }, "title"), "Board title");
    this.body.append(
      this.field("Board title", title),
      h("p", { class: "muted" }, "Select a component or an arrow to edit it."),
      h("h3", {}, "Shortcuts"),
      h(
        "dl",
        { class: "keys" },
        ...[
          ["V / C / X", "Select / connect / text tool"],
          ["Q / E", "Rotate the view"],
          ["R", "Auto-rotate the 3D board"],
          ["T", "Switch between 3D and 2D"],
          ["F", "Fit board to screen"],
          ["Delete", "Remove selection"],
          ["Cmd/Ctrl+D", "Duplicate"],
          ["Cmd/Ctrl+Z", "Undo (add Shift to redo)"],
          ["Arrow keys", "Nudge (Shift for a full cell)"],
          ["Double click", "Rename"],
          ["Space + drag", "Pan (so do right and middle drag)"],
          ["Esc", "Cancel / deselect"],
        ].flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]),
      ),
    );
  }

  private renderMulti(n: number): void {
    this.body.append(
      h("p", {}, `${n} items selected.`),
      this.action("sparkle", "Duplicate", () => this.store.duplicateSelected()),
      this.action("trash", "Delete", () => this.store.deleteSelected(), true),
    );
  }

  private renderNode(id: string): void {
    const node = () => this.store.node(id)!;
    const label = this.text(() => node().label, (v) => this.store.mutate((d) => { const n = d.nodes.find((x) => x.id === id); if (n) n.label = v; }, "label:" + id), "Component name");
    this.focusTarget = label;

    const type = h("select", {});
    for (const k of ICON_KEYS) type.append(h("option", { value: k }, ICON_NAMES[k]));
    type.value = node().icon;
    type.addEventListener("change", () => {
      if (!isIconKey(type.value)) return;
      const icon: IconKey = type.value;
      this.store.mutate((d) => { const n = d.nodes.find((x) => x.id === id); if (n) n.icon = icon; });
    });
    this.refreshers.push(() => { type.value = node().icon; });

    const move = (axis: "gx" | "gy") => (v: number | undefined) => {
      if (v === undefined || !Number.isFinite(v)) return;
      const next = snap(v);
      const n = node();
      const gx = axis === "gx" ? next : n.gx, gy = axis === "gy" ? next : n.gy;
      if (!this.store.isFree(gx, gy, [id])) return;
      this.store.mutate((d) => { const m = d.nodes.find((x) => x.id === id); if (m) m[axis] = next; });
    };

    this.body.append(
      this.field("Name", label),
      this.field("Type", type),
      h("div", { class: "row2" },
        this.field("Column", this.number(() => node().gx, move("gx"), 0.5)),
        this.field("Row", this.number(() => node().gy, move("gy"), 0.5))),
      h("p", { class: "muted" }, "Positions snap to half cells. Tiles need a full cell of space between them on at least one axis."),
      this.action("sparkle", "Duplicate", () => this.store.duplicateSelected()),
      this.action("trash", "Delete", () => this.store.deleteSelected(), true),
    );
  }

  private renderText(id: string): void {
    const box = () => this.store.textBox(id)!;
    const patch = (fn: (t: ReturnType<typeof box>) => void, key?: string) =>
      this.store.mutate((d) => { const t = d.texts.find((x) => x.id === id); if (t) fn(t); }, key);

    const text = this.area(() => box().text, (v) => patch((t) => { t.text = v; }, "text:" + id), "Type a caption. Enter starts a new line.");
    this.focusTarget = text;

    const size = h("select", {});
    for (const k of TEXT_SIZES) size.append(h("option", { value: k }, TEXT_SIZE_NAMES[k]));
    size.value = box().size;
    size.addEventListener("change", () => { if (isTextSize(size.value)) { const v = size.value; patch((t) => { t.size = v; }); } });
    this.refreshers.push(() => { size.value = box().size; });

    const move = (axis: "gx" | "gy") => (v: number | undefined) => {
      if (v === undefined || !Number.isFinite(v)) return;
      patch((t) => { t[axis] = snap(v); });
    };

    this.body.append(
      this.field("Text", text),
      this.field("Size", size),
      this.check("Draw a box around it", () => !!box().boxed, (v) => patch((t) => { if (v) t.boxed = true; else delete t.boxed; })),
      h("div", { class: "row2" },
        this.field("Column", this.number(() => box().gx, move("gx"), 0.5)),
        this.field("Row", this.number(() => box().gy, move("gy"), 0.5))),
      h("p", { class: "muted" }, "Text boxes are labels for the picture. Arrows connect components, not text."),
      this.action("sparkle", "Duplicate", () => this.store.duplicateSelected()),
      this.action("trash", "Delete", () => this.store.deleteSelected(), true),
    );
  }

  private renderEdge(id: string): void {
    const edge = () => this.store.edge(id)!;
    const patch = (fn: (e: ReturnType<typeof edge>) => void, key?: string) =>
      this.store.mutate((d) => { const e = d.edges.find((x) => x.id === id); if (e) fn(e); }, key);
    const name = (nid: string) => this.store.node(nid)?.label || "?";

    const label = this.text(() => edge().label ?? "", (v) => patch((e) => { if (v) e.label = v; else delete e.label; }, "elabel:" + id), "What moves (2 to 4 words)");
    this.focusTarget = label;

    this.body.append(
      h("p", { class: "route" }, `${name(edge().from)}  →  ${name(edge().to)}`),
      this.field("Label", label),
      this.field("Step badge", this.number(() => edge().step, (v) => patch((e) => {
        if (v === undefined || !Number.isInteger(v) || v < 1) delete e.step; else e.step = v;
      }), 1, 1)),
      this.check("Key path (accent colour)", () => !!edge().hot, (v) => patch((e) => { if (v) e.hot = true; else delete e.hot; })),
      this.check("Dashed (async, error or reply)", () => !!edge().dash, (v) => patch((e) => { if (v) e.dash = true; else delete e.dash; })),
      this.check("Arrow heads at both ends (two way)", () => !!edge().both, (v) => patch((e) => { if (v) e.both = true; else delete e.both; })),
      this.action("swap", "Reverse direction", () => this.store.reverseEdge(id)),
      this.action("trash", "Delete", () => this.store.deleteSelected(), true),
    );
  }
}
