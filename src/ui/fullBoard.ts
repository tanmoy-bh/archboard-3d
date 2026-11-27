import type { SceneView } from "../scene/sceneView";
import { h, svg } from "./dom";
import { UI_ICONS } from "./icons";

/** `lock` and `unlock` are missing from some browsers, iPhone Safari among them, and from the standard types. */
type Orientation = { lock?: (to: "landscape") => Promise<void>; unlock?: () => void };

/**
 * The whole board on the whole screen, in landscape, for phones. Where the browser can, it goes full screen and
 * locks the screen to landscape (Android). Where it cannot (iPhone), the board itself is turned a quarter turn
 * while the phone is held upright, so turning the phone sideways reads it the right way up.
 */
export class FullBoard {
  readonly button: HTMLButtonElement;
  private bar: HTMLElement;
  private active = false;
  private wentNative = false;
  private upright = window.matchMedia("(orientation: portrait)");

  /** `host` holds the canvas. `onToggle` hears the view being entered and left. */
  constructor(private host: HTMLElement, private view: SceneView, private onToggle: (on: boolean) => void = () => {}) {
    this.button = h("button", { class: "fullboard-open", type: "button", title: "Show the whole board full screen, in landscape", onclick: () => this.enter() }, svg(UI_ICONS.expand), h("span", {}, "Full screen"));
    const btn = (icon: keyof typeof UI_ICONS, label: string, onclick: () => void) =>
      h("button", { class: "tb", type: "button", title: label, "aria-label": label, onclick }, svg(UI_ICONS[icon]));
    this.bar = h("div", { class: "fullboard-bar", role: "toolbar", "aria-label": "Full screen controls" },
      btn("fit", "Show the whole board", () => view.fit()),
      btn("close", "Leave full screen", () => this.exit()));

    this.upright.addEventListener("change", () => { if (this.active) this.layout(); });
    document.addEventListener("fullscreenchange", () => {
      if (!this.active) return;
      if (document.fullscreenElement) this.layout();
      else if (this.wentNative) this.exit(); // the phone's own way out (a swipe or the back button)
    });
    window.addEventListener("keydown", (e) => { if (this.active && e.key === "Escape") this.exit(); });
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.wentNative = false;
    this.onToggle(true);
    this.host.classList.add("fullboard");
    this.host.append(this.bar);
    this.layout();
    // Both of these are refused on some phones. The turned board covers that case.
    document.documentElement.requestFullscreen?.().then(async () => {
      if (!this.active) { await document.exitFullscreen(); return; }
      this.wentNative = true;
      await (screen.orientation as unknown as Orientation | undefined)?.lock?.("landscape");
    }).catch(() => { /* stay as we are */ });
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    (screen.orientation as unknown as Orientation | undefined)?.unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => { /* already out */ });
    this.bar.remove();
    this.host.classList.remove("fullboard");
    this.layout();
    this.onToggle(false);
  }

  /** Turn the board if the screen is upright, then show all of it at its new size. */
  private layout(): void {
    const turned = this.active && this.upright.matches;
    this.host.classList.toggle("turned", turned);
    this.view.turned = turned;
    const refit = () => { this.view.resizeNow(); this.view.fit(); };
    refit();
    window.setTimeout(refit, 350); // phones report the new size a moment late
  }
}
