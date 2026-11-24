import { ICON_NAMES, PALETTE_GROUPS } from "../glyphs/catalog";
import { searchComponents } from "../glyphs/search";
import { glyphImage } from "../glyphs/thumbs";
import type { Controller } from "../interaction/controller";
import type { IconKey } from "../model/types";
import type { ViewMode } from "../scene/constants";
import { h } from "./dom";
import { collapsible, panelHead } from "./panels";

/**
 * Left panel: every component, grouped, shown as a picture of its real 3D model.
 * Click to arm and then click the floor, or drag onto the board.
 */
export class Palette {
  readonly el: HTMLElement;
  private buttons = new Map<IconKey, HTMLButtonElement>();
  private key = "";
  private groups: { section: HTMLElement; icons: IconKey[] }[] = [];
  private list = h("div", { class: "palette-list" });
  private empty = h("p", { class: "muted palette-empty", hidden: true }, "No component matches. Try another word, such as queue, cache or kubernetes.");
  private search = h("input", { class: "palette-search", type: "search", placeholder: "Search components", "aria-label": "Search components", autocomplete: "off", spellcheck: "false" });
  private body = h("div", { class: "panel-body" });

  constructor(private controller: Controller) {
    this.body.append(h("p", { class: "hint" }, "Click one, then click the floor. Or drag it onto the board."), this.search, this.empty, this.list);
    this.search.addEventListener("input", () => this.filter());
    this.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.search.value) {
        this.search.value = "";
        this.filter();
        e.stopPropagation();
      } else if (e.key === "Enter") {
        const first = [...this.buttons.entries()].find(([, b]) => !b.hidden);
        if (first) this.controller.arm(first[0]);
      }
    });
    this.el = h("aside", { class: "palette", "aria-label": "Component palette" }, panelHead("Components", "panel:left", "Show components"), this.body);
  }

  /** (Re)draw the palette. Pictures follow the view mode: 3D renders, or the flat glyphs. */
  build(mode: ViewMode, fg: string): void {
    const key = mode + fg;
    if (key === this.key) return;
    this.key = key;
    this.buttons.clear();
    this.groups = [];
    this.list.replaceChildren();
    for (const group of PALETTE_GROUPS) {
      const grid = h("div", { class: "palette-grid" });
      for (const icon of group.icons) {
        const src = glyphImage(icon, mode, fg);
        const b = h(
          "button",
          { class: "palette-item", type: "button", draggable: "true", title: ICON_NAMES[icon], "data-icon": icon },
          src ? h("img", { src, width: 44, height: 44, alt: "", draggable: "false" }) : h("span", { class: "thumb-missing" }),
          h("span", {}, ICON_NAMES[icon]),
        );
        b.addEventListener("click", () => this.controller.arm(this.controller.armed === icon ? null : icon));
        b.addEventListener("dragstart", (e) => {
          e.dataTransfer?.setData("application/x-archboard-icon", icon);
          e.dataTransfer!.effectAllowed = "copy";
          this.controller.setDraggingIcon(icon);
        });
        b.addEventListener("dragend", () => this.controller.setDraggingIcon(null));
        this.buttons.set(icon, b);
        grid.append(b);
      }
      const section = h("section", { class: "palette-group" }, h("h3", {}, group.title), grid);
      collapsible(section, "group:" + group.title, group.icons.length);
      this.list.append(section);
      this.groups.push({ section, icons: group.icons });
    }
    this.filter();
    this.refresh();
  }

  /** Show only the components that match the search box. Matching groups open up while a search is active. */
  private filter(): void {
    const query = this.search.value.trim();
    const hits = searchComponents(query);
    let shown = 0;
    for (const g of this.groups) {
      let any = false;
      for (const icon of g.icons) {
        const b = this.buttons.get(icon);
        if (!b) continue;
        b.hidden = !hits.has(icon);
        if (!b.hidden) any = true;
      }
      g.section.hidden = !any;
      if (any) shown += 1;
    }
    this.el.classList.toggle("searching", query !== "");
    this.empty.hidden = shown > 0;
  }

  refresh(): void {
    for (const [icon, b] of this.buttons) b.classList.toggle("active", this.controller.armed === icon);
  }
}
