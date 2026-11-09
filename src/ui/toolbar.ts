import type { Controller } from "../interaction/controller";
import type { Store } from "../model/store";
import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";

export interface FileActions {
  newBoard(): void;
  openBoard(): void;
  saveBoard(): void;
  exportPng(): void;
  loadExample(): void;
  toggleTheme(): void;
}

type IconName = keyof typeof UI_ICONS;

/** Top bar: tools, history, view, file. */
export class Toolbar {
  readonly el: HTMLElement;
  private select!: HTMLButtonElement;
  private connect!: HTMLButtonElement;
  private undo!: HTMLButtonElement;
  private redo!: HTMLButtonElement;
  private themeBtn!: HTMLButtonElement;

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
    this.undo = btn("undo", "Undo (Cmd/Ctrl+Z)", () => store.undo());
    this.redo = btn("redo", "Redo (Shift+Cmd/Ctrl+Z)", () => store.redo());
    this.themeBtn = btn("sun", "Switch light or dark theme", () => files.toggleTheme());

    this.el = h(
      "header",
      { class: "toolbar" },
      h("div", { class: "brand" }, h("span", { class: "logo", "aria-hidden": "true" }, "◧"), h("strong", {}, "Archboard 3D")),
      sep(),
      this.select, this.connect,
      sep(),
      this.undo, this.redo,
      sep(),
      btn("rotateL", "Rotate view left (Q)", () => view.rotateView(-1)),
      btn("rotateR", "Rotate view right (E)", () => view.rotateView(1)),
      btn("minus", "Zoom out (-)", () => view.zoomCentered(1 / 1.2)),
      btn("plus", "Zoom in (+)", () => view.zoomCentered(1.2)),
      btn("fit", "Fit board to screen (F)", () => view.fit()),
      h("span", { class: "grow" }),
      btn("sparkle", "Load the example board", files.loadExample, "Example"),
      btn("file", "New empty board", files.newBoard, "New"),
      btn("open", "Open a board from a JSON file", files.openBoard, "Open"),
      btn("save", "Save the board as a JSON file", files.saveBoard, "Save"),
      btn("image", "Export a PNG image", files.exportPng, "PNG"),
      sep(),
      this.themeBtn,
    );
    this.refresh(true);
  }

  refresh(dark: boolean): void {
    this.select.classList.toggle("active", this.controller.tool === "select");
    this.connect.classList.toggle("active", this.controller.tool === "connect");
    this.undo.disabled = !this.store.canUndo;
    this.redo.disabled = !this.store.canRedo;
    this.themeBtn.replaceChildren(svg(UI_ICONS[dark ? "sun" : "moon"]));
  }
}
