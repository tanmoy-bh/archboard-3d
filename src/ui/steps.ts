import type { Store } from "../model/store";
import { h } from "./dom";

/** The written step list that the numbered badges on arrows point to. */
export class StepsPanel {
  readonly el: HTMLElement;
  private area: HTMLTextAreaElement;
  private warn: HTMLElement;

  constructor(private store: Store) {
    this.area = h("textarea", {
      rows: 7,
      spellcheck: true,
      placeholder: "One step per line.\nBadge 1 on an arrow means the first line.",
      "aria-label": "Step list",
    });
    this.area.addEventListener("input", () => {
      const lines = this.area.value.split("\n").map((l) => l.trim()).filter(Boolean);
      this.store.mutate((d) => { d.steps = lines; }, "steps");
    });
    this.warn = h("p", { class: "warn", role: "status" });
    this.el = h(
      "section",
      { class: "steps" },
      h("h2", {}, "How it works"),
      h("p", { class: "muted" }, "Write the story once. Number each arrow with a step badge to tie the picture to these lines."),
      this.area,
      this.warn,
    );
    this.update();
  }

  update(): void {
    if (document.activeElement !== this.area) this.area.value = this.store.doc.steps.join("\n");
    const count = this.store.doc.steps.length;
    const badges = this.store.doc.edges.map((e) => e.step ?? 0).filter((s) => s > 0);
    const over = [...new Set(badges.filter((s) => s > count))].sort((a, b) => a - b);
    this.warn.textContent = over.length ? `Badge ${over.join(", ")} has no matching line in the list.` : "";
  }
}
