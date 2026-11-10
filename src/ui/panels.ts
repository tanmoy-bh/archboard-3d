import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";

/** Which sections and side panels are folded, remembered between visits (browser storage may be blocked). */
const KEY = "archboard3d.collapsed";
let cache: Set<string> | null = null;

function load(): Set<string> {
  if (!cache) {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
      cache = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
    } catch { cache = new Set(); }
  }
  return cache;
}

export const isCollapsed = (id: string): boolean => load().has(id);

export function setCollapsed(id: string, folded: boolean): void {
  const s = load();
  if (folded) s.add(id); else s.delete(id);
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

/**
 * Turn the first heading of `section` into a button that folds everything else in it.
 * `count` adds a small number after the title (the palette shows how many items a group holds).
 */
export function collapsible(section: HTMLElement, id: string, count?: number): void {
  const head = section.querySelector<HTMLElement>(":scope > h2, :scope > h3");
  if (!head) return;
  const label = head.textContent ?? "";
  const btn = h("button", { class: "sect-head", type: "button" }, svg(UI_ICONS.chevron), h("span", { class: "sect-title" }, label), count === undefined ? null : h("small", { class: "count" }, String(count)));
  head.replaceChildren(btn);
  const apply = (folded: boolean) => {
    section.classList.toggle("collapsed", folded);
    btn.setAttribute("aria-expanded", String(!folded));
  };
  btn.addEventListener("click", () => {
    const folded = !section.classList.contains("collapsed");
    setCollapsed(id, folded);
    apply(folded);
  });
  apply(isCollapsed(id));
}

export const PANEL_CLASS: Record<string, string> = { "panel:left": "pal-collapsed", "panel:right": "sb-collapsed" };

/** Title row of a side panel with a button that folds the whole panel down to a thin rail. */
export function panelHead(title: string, id: "panel:left" | "panel:right", showLabel: string): HTMLElement {
  const btn = h("button", { class: "panel-toggle", type: "button", "data-panel": id, title: `Hide ${title.toLowerCase()}`, "aria-label": `Hide ${title.toLowerCase()}`, "aria-expanded": "true" }, svg(UI_ICONS.chevron));
  btn.addEventListener("click", () => {
    const workspace = btn.closest<HTMLElement>(".workspace");
    if (!workspace) return;
    const folded = !workspace.classList.contains(PANEL_CLASS[id]);
    setCollapsed(id, folded);
    syncPanel(workspace, btn, id, title, showLabel);
  });
  btn.dataset.title = title;
  btn.dataset.showLabel = showLabel;
  return h("div", { class: "panel-head" }, h("h2", {}, title), btn);
}

function syncPanel(workspace: HTMLElement, btn: HTMLElement, id: string, title: string, showLabel: string): void {
  const folded = isCollapsed(id);
  workspace.classList.toggle(PANEL_CLASS[id], folded);
  btn.setAttribute("aria-expanded", String(!folded));
  const text = folded ? showLabel : `Hide ${title.toLowerCase()}`;
  btn.title = text;
  btn.setAttribute("aria-label", text);
}

/** Apply the remembered folded state once the panels are in the page. */
export function restorePanels(workspace: HTMLElement): void {
  for (const btn of workspace.querySelectorAll<HTMLElement>(".panel-toggle")) {
    syncPanel(workspace, btn, btn.dataset.panel ?? "", btn.dataset.title ?? "", btn.dataset.showLabel ?? "Show panel");
  }
}
