import type { Controller } from "../interaction/controller";
import type { Store } from "../model/store";
import type { ViewMode } from "../scene/constants";
import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";

export interface FileActions {
  newBoard(): void;
  openBoard(): void;
  saveBoard(): void;
  exportPng(): void;
  loadExample(): void;
  toggleTheme(): void;
  setMode(mode: ViewMode): void;
  clearAll(): void;
}

type IconName = keyof typeof UI_ICONS;

/** Top bar: tools, history, view, file. */
export class Toolbar {
  readonly el: HTMLElement;
  private select!: HTMLButtonElement;
  private connect!: HTMLButtonElement;
  private textTool!: HTMLButtonElement;
  private undo!: HTMLButtonElement;
  private redo!: HTMLButtonElement;
  private themeBtn!: HTMLButtonElement;
  private modeBtns!: Record<ViewMode, HTMLButtonElement>;

  constructor(
    private store: Store,
    private controller: Controller,
    private view: { rotateView(d: 1 | -1): void; fit(): void; zoomCentered(f: number): void },
    private files: FileActions,
  ) {
    const btn = (icon: IconName, title: string, onclick: () => void, label?: string) =>
      h("button", { class: "tb", type: "button", title, "aria-label": title, onclick }, svg(UI_ICONS[icon]), label ? h("span", {}, label) : null);
    const sep = () => h("span", { class: "sep", role: "separator" });

    this.select = btn("select", "Select and move (V)", () => controller.setTool("select"), "Select");
    this.connect = btn("connect", "Connect two components (C)", () => controller.setTool("connect"), "Connect");
    this.textTool = btn("text", "Add a text box (X)", () => controller.setTool("text"), "Text");
    this.undo = btn("undo", "Undo (Cmd/Ctrl+Z)", () => store.undo());
    this.redo = btn("redo", "Redo (Shift+Cmd/Ctrl+Z)", () => store.redo());
    this.themeBtn = btn("sun", "Switch light or dark theme", () => files.toggleTheme());
    const modeBtn = (mode: ViewMode, label: string, title: string) =>
      h("button", { class: "seg-btn", type: "button", title, "aria-label": title, "data-mode": mode, onclick: () => files.setMode(mode) }, label);
    this.modeBtns = {
      "3d": modeBtn("3d", "3D", "Isometric board with 3D models (T)"),
      "2d": modeBtn("2d", "2D", "Flat top-down board with 2D glyphs (T)"),
    };
    const modeToggle = h("div", { class: "seg", role: "group", "aria-label": "View mode" }, this.modeBtns["3d"], this.modeBtns["2d"]);

    this.el = h(
      "header",
      { class: "toolbar" },
      h("div", { class: "brand" }, h("span", { class: "logo", "aria-hidden": "true" }, "◧"), h("strong", {}, "Archboard 3D")),
      sep(),
      this.select, this.connect, this.textTool,
      sep(),
      this.undo, this.redo,
      sep(),
      btn("rotateL", "Rotate view left (Q)", () => view.rotateView(-1)),
      btn("rotateR", "Rotate view right (E)", () => view.rotateView(1)),
      btn("minus", "Zoom out (-)", () => view.zoomCentered(1 / 1.2)),
      btn("plus", "Zoom in (+)", () => view.zoomCentered(1.2)),
      btn("fit", "Fit board to screen (F)", () => view.fit()),
      sep(),
      modeToggle,
      h("span", { class: "grow" }),
      btn("sparkle", "Load the example board", files.loadExample, "Example"),
      btn("trash", "Remove everything from the board. Undo brings it back.", files.clearAll, "Clear"),
      btn("file", "New empty board", files.newBoard, "New"),
      btn("open", "Open a board from a JSON file", files.openBoard, "Open"),
      btn("save", "Save the board as a JSON file", files.saveBoard, "Save"),
      btn("image", "Export a PNG image", files.exportPng, "PNG"),
      sep(),
      this.themeBtn,
      // The deployed site is gated on the server; this signs you out of it. There is no gate in local dev.
      import.meta.env.PROD
        ? h("a", { class: "tb", href: "__logout", title: "Lock this page (sign out)", "aria-label": "Lock this page" }, svg(UI_ICONS.lock))
        : null,
    );
    this.refresh(true, "3d");
  }

  refresh(dark: boolean, mode: ViewMode): void {
    for (const m of ["3d", "2d"] as const) {
      this.modeBtns[m].classList.toggle("active", m === mode);
      this.modeBtns[m].setAttribute("aria-pressed", String(m === mode));
    }
    this.select.classList.toggle("active", this.controller.tool === "select");
    this.connect.classList.toggle("active", this.controller.tool === "connect");
    this.textTool.classList.toggle("active", this.controller.tool === "text");
    this.undo.disabled = !this.store.canUndo;
    this.redo.disabled = !this.store.canRedo;
    this.themeBtn.replaceChildren(svg(UI_ICONS[dark ? "sun" : "moon"]));
  }
}
