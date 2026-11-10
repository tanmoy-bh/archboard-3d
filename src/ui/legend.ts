import { ICON_NAMES } from "../glyphs/catalog";
import { glyphImage } from "../glyphs/thumbs";
import type { Store } from "../model/store";
import { ICON_KEYS } from "../model/types";
import type { ViewMode } from "../scene/constants";
import { h } from "./dom";

/** Legend that lives outside the drawing: only the components in use, plus key path and step badge. */
export class Legend {
  readonly el: HTMLElement;
  private key = "";
  /** Starts collapsed on short screens so it never covers the board. */
  private collapsed = window.innerHeight < 760;

  constructor(private store: Store) {
    this.el = h("aside", { class: "legend", "aria-label": "Legend" });
  }

  update(mode: ViewMode, fg: string): void {
    const used = ICON_KEYS.filter((k) => this.store.doc.nodes.some((n) => n.icon === k));
    const hot = this.store.doc.edges.some((e) => e.hot);
    const dash = this.store.doc.edges.some((e) => e.dash);
    const steps = this.store.doc.edges.some((e) => e.step);
    const key = [used.join(), hot, dash, steps, this.collapsed, mode, fg].join("|");
    if (key === this.key) return;
    this.key = key;

    this.el.replaceChildren();
    this.el.hidden = used.length === 0;
    if (used.length === 0) return;
    const toggle = h("button", { class: "legend-toggle", type: "button", "aria-expanded": String(!this.collapsed) }, h("span", {}, "Legend"), h("i", { "aria-hidden": "true" }, this.collapsed ? "+" : "–"));
    toggle.addEventListener("click", () => { this.collapsed = !this.collapsed; this.key = ""; this.update(mode, fg); });
    this.el.append(toggle);
    if (this.collapsed) return;

    const list = h("ul", {});
    for (const k of used) {
      const src = glyphImage(k, mode, fg);
      list.append(h("li", {}, src ? h("img", { src, width: 28, height: 28, alt: "" }) : h("i", { class: "thumb-missing" }), h("span", {}, ICON_NAMES[k])));
    }
    if (hot) list.append(h("li", {}, h("i", { class: "swatch hot" }), h("span", {}, "Key path")));
    if (dash) list.append(h("li", {}, h("i", { class: "swatch dash" }), h("span", {}, "Async / reply")));
    if (steps) list.append(h("li", {}, h("i", { class: "swatch badge" }, "1"), h("span", {}, "Step in How it works")));
    this.el.append(list);
  }
}
