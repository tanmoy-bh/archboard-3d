import { ICON_NAMES, PALETTE_GROUPS, iconSvg } from "../glyphs/icons";
import type { Controller } from "../interaction/controller";
import type { IconKey } from "../model/types";
import { h, svg } from "./dom";

/** Left panel: every glyph, grouped. Click to arm and then click the floor, or drag onto the board. */
export class Palette {
  readonly el: HTMLElement;
  private buttons = new Map<IconKey, HTMLButtonElement>();
  private colorKey = "";

  constructor(private controller: Controller) {
    this.el = h("aside", { class: "palette", "aria-label": "Component palette" });
    this.build("#e7e3d9");
  }

  /** Rebuild icon previews with the theme foreground colour (a few glyphs use currentColor). */
  build(fg: string): void {
    if (fg === this.colorKey) return;
    this.colorKey = fg;
    this.el.replaceChildren(h("h2", {}, "Components"), h("p", { class: "hint" }, "Click one, then click the floor. Or drag it onto the board."));
    this.buttons.clear();
    for (const group of PALETTE_GROUPS) {
      const grid = h("div", { class: "palette-grid" });
      for (const icon of group.icons) {
        const b = h(
          "button",
          { class: "palette-item", type: "button", draggable: "true", title: ICON_NAMES[icon], "data-icon": icon },
          svg(iconSvg(icon, fg, 36)),
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
      this.el.append(h("section", {}, h("h3", {}, group.title), grid));
    }
    this.refresh();
  }

  refresh(): void {
    for (const [icon, b] of this.buttons) b.classList.toggle("active", this.controller.armed === icon);
  }
}
