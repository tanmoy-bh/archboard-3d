import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";

export interface Dialog { el: HTMLElement; close(): void }

/**
 * A modal window over the editor. Escape or a click outside closes it. While it is open the editor's single key
 * shortcuts are switched off, so typing in a field never changes tools or deletes a component.
 */
export function openDialog(title: string, body: HTMLElement, onClose?: () => void): Dialog {
  const previous = document.activeElement as HTMLElement | null;
  const card = h("div", { class: "modal-card", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div", { class: "modal-head" },
      h("h2", {}, title),
      h("button", { class: "tb", type: "button", title: "Close", "aria-label": "Close", onclick: () => close() }, svg(UI_ICONS.close))),
    body);
  const el = h("div", { class: "modal" }, card);
  el.addEventListener("pointerdown", (e) => { if (e.target === el) close(); });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); return; }
    e.stopImmediatePropagation(); // keep the editor's shortcuts out of it; the browser's own typing and Tab still work
  };
  window.addEventListener("keydown", onKey, true);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", onKey, true);
    el.remove();
    previous?.focus?.();
    onClose?.();
  }
  document.body.append(el);
  (card.querySelector("input, select, button.btn") as HTMLElement | null)?.focus();
  return { el, close };
}

/** Copy text to the clipboard. Falls back to selecting it in a prompt where the browser blocks the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = h("textarea", { style: "position:fixed;left:-9999px" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}
