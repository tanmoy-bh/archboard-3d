import { h } from "../ui/dom";
import { checkPassphrase } from "./passphrase";

const KEY = "archboard3d.unlocked";

/** True when this browser tab has already passed the gate. */
export function isUnlocked(): boolean {
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
}

function remember(): void {
  try { sessionStorage.setItem(KEY, "1"); } catch { /* the gate then asks again on reload */ }
}

/**
 * Show the passphrase screen and resolve once the right passphrase is entered. Nothing else is built
 * or loaded until then. Wrong guesses are slowed down a little more each time.
 */
export function showGate(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let failures = 0;
    let busy = false;

    const input = h("input", {
      id: "gate-pass", type: "password", autocomplete: "off", spellcheck: false,
      "aria-describedby": "gate-msg", placeholder: "Passphrase", required: true,
    });
    const msg = h("p", { id: "gate-msg", class: "gate-msg", role: "alert" });
    const btn = h("button", { class: "gate-btn", type: "submit" }, "Unlock");
    const form = h(
      "form",
      { class: "gate-card", autocomplete: "off" },
      h("div", { class: "gate-logo", "aria-hidden": "true" }, "◧"),
      h("h1", {}, "Archboard 3D"),
      h("p", { class: "gate-sub" }, "Enter the passphrase to open the board."),
      h("label", { class: "gate-label", for: "gate-pass" }, "Passphrase"),
      input,
      msg,
      btn,
    );

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      btn.disabled = true;
      msg.textContent = "Checking…";
      // Let the browser paint "Checking…" before the hash work (about a few hundredths of a second).
      setTimeout(async () => {
        const ok = checkPassphrase(input.value);
        input.value = "";
        if (ok) {
          remember();
          gate.remove();
          resolve();
          return;
        }
        failures++;
        msg.textContent = "That passphrase is not right.";
        input.setAttribute("aria-invalid", "true");
        await new Promise((r) => setTimeout(r, Math.min(400 * failures, 4000)));
        busy = false;
        btn.disabled = false;
        input.focus();
      }, 30);
    });
    input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); if (!busy) msg.textContent = ""; });

    const gate = h("div", { class: "gate" }, form);
    root.replaceChildren(gate);
    input.focus();
  });
}
