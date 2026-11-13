import "../style.css";
import "./view.css";
import { parseDoc } from "../model/serialize";
import { Store } from "../model/store";
import type { DocData } from "../model/types";
import type { ViewMode } from "../scene/constants";
import { SceneView } from "../scene/sceneView";
import { unpackDoc } from "../share/codec";
import { ViewSource, parseViewParams } from "../share/links";
import { readTheme } from "../theme";
import { h, svg } from "../ui/dom";
import { UI_ICONS } from "../ui/icons";

/** Fetch a board by the way the link names it. Errors carry a sentence meant to be shown. */
async function load(source: ViewSource): Promise<DocData> {
  if (source.kind === "packed") return unpackDoc(source.data);
  // Relative to .../view/, so it works under any path prefix (the projects hub serves this under /archboard-3d/).
  const url = source.kind === "id" ? `../api/d/${source.id}` : `../diagrams/${source.name}.json`;
  let res: Response;
  try { res = await fetch(url, { headers: { Accept: "application/json" } }); }
  catch { throw new Error("The diagram could not be loaded. Check your connection and try again."); }
  if (res.status === 404) throw new Error("This diagram was not found. The link may be wrong, or it was taken down.");
  if (!res.ok) throw new Error(`The diagram could not be loaded (error ${res.status}).`);
  return parseDoc(await res.text());
}

function boot(): void {
  const app = document.getElementById("app")!;
  app.replaceChildren();
  const { source, opts } = parseViewParams(location.search, location.hash);
  if (opts.theme !== "auto") document.documentElement.dataset.theme = opts.theme;

  const stage = h("div", { class: "vstage" });
  const msg = h("div", { class: "vmsg", role: "status" }, h("div", {}, h("strong", {}, "Loading the diagram"), "One moment."));
  const wrap = h("div", { class: "vwrap" }, stage, msg);
  app.append(wrap);

  const fail = (title: string, detail: string) => {
    msg.className = "vmsg error";
    msg.replaceChildren(h("div", {}, h("strong", {}, title), detail));
  };

  if (!source) { fail("No diagram in this link", "Open a link made with the Share button in Archboard 3D."); return; }

  load(source).then((doc) => {
    if (doc.nodes.length === 0 && doc.texts.length === 0 && doc.zones.length === 0) { fail("This diagram is empty", ""); return; }
    document.title = `${doc.title} · Archboard 3D`;

    let view: SceneView;
    try { view = new SceneView(stage, new Store(doc), readTheme()); }
    catch { fail("3D is not available", "This diagram needs WebGL. Turn on hardware acceleration in your browser."); return; }
    msg.remove();

    let mode: ViewMode = opts.mode;
    let playing = opts.play;
    view.resizeNow();
    view.setMode(mode, false);
    view.setAutoRotate(playing);

    const btn = (icon: keyof typeof UI_ICONS, title: string, onclick: () => void) =>
      h("button", { class: "tb", type: "button", title, "aria-label": title, onclick }, svg(UI_ICONS[icon]));
    const modeBtn = (m: ViewMode, label: string, title: string) =>
      h("button", { class: "seg-btn", type: "button", title, "aria-label": title, onclick: () => setMode(m) }, label);
    const b3 = modeBtn("3d", "3D", "Isometric board with 3D models");
    const b2 = modeBtn("2d", "2D", "Flat top-down board");
    const playBtn = h("button", { class: "tb", type: "button", onclick: () => { playing = !playing; view.setAutoRotate(playing); refresh(); } });

    const refresh = () => {
      b3.classList.toggle("active", mode === "3d");
      b2.classList.toggle("active", mode === "2d");
      b3.setAttribute("aria-pressed", String(mode === "3d"));
      b2.setAttribute("aria-pressed", String(mode === "2d"));
      const label = mode !== "3d" ? "Turning works in 3D only" : playing ? "Pause turning" : "Turn the board slowly";
      playBtn.replaceChildren(svg(UI_ICONS[playing && mode === "3d" ? "pause" : "play"]));
      playBtn.title = label;
      playBtn.setAttribute("aria-label", label);
      playBtn.disabled = mode !== "3d";
    };
    const setMode = (m: ViewMode) => { if (m === mode) return; mode = m; view.setMode(mode); refresh(); };

    // Light and dark. The button flips it; a host page can also set it with
    //   iframe.contentWindow.postMessage({ type: "archboard:theme", theme: "dark" }, "*")   ("light", "dark" or "auto")
    const themeBtn = h("button", { class: "tb", type: "button", onclick: () => setTheme(readTheme().dark ? "light" : "dark") });
    const refreshTheme = () => {
      const dark = readTheme().dark;
      themeBtn.replaceChildren(svg(UI_ICONS[dark ? "sun" : "moon"]));
      const label = dark ? "Switch to the light theme" : "Switch to the dark theme";
      themeBtn.title = label;
      themeBtn.setAttribute("aria-label", label);
    };
    const setTheme = (t: "light" | "dark" | "auto") => {
      if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
      view.setTheme(readTheme());
      refreshTheme();
    };
    window.addEventListener("message", (e) => {
      const d = e.data as { type?: unknown; theme?: unknown } | null;
      if (d && d.type === "archboard:theme" && (d.theme === "light" || d.theme === "dark" || d.theme === "auto")) setTheme(d.theme);
    });

    // Bigger view. Inside another page the button opens the diagram in its own full page in a new tab, like the draw.io
    // viewer in Confluence: reliable everywhere, with the same view you were looking at. On a page of its own the
    // button uses the browser's full screen.
    const embedded = window.self !== window.top;
    const canFullscreen = !!document.fullscreenEnabled;
    const isFull = () => !!document.fullscreenElement;
    const fullPageUrl = (): string => {
      const u = new URL(location.href);
      u.searchParams.delete("controls");
      u.searchParams.set("mode", mode);
      u.searchParams.set("theme", readTheme().dark ? "dark" : "light");
      if (playing) u.searchParams.delete("play"); else u.searchParams.set("play", "0");
      return u.toString();
    };
    const bigBtn = h("button", { class: "tb", type: "button", onclick: () => bigger() });
    const refreshBig = () => {
      const label = embedded ? "Open in a full page" : isFull() ? "Leave full screen" : "Full screen";
      bigBtn.replaceChildren(svg(UI_ICONS[embedded ? "openOut" : isFull() ? "shrink" : "expand"]));
      bigBtn.title = label;
      bigBtn.setAttribute("aria-label", label);
    };
    const bigger = () => {
      if (embedded) { window.open(fullPageUrl(), "_blank", "noopener"); return; }
      if (isFull()) void document.exitFullscreen();
      else if (canFullscreen) void document.documentElement.requestFullscreen().catch(() => { /* the browser said no: the page already fills the window */ });
    };
    document.addEventListener("fullscreenchange", () => {
      refreshBig();
      setTimeout(() => { view.resizeNow(); view.fit(); }, 150); // fill the new size
    });

    // The written steps behind the numbered arrows, so the diagram can be read in full detail.
    const stepsPanel = doc.steps.length
      ? h("aside", { class: "vsteps", "aria-label": "How it works", hidden: true },
          h("div", { class: "vsteps-head" }, h("strong", {}, "How it works"),
            h("button", { class: "tb", type: "button", title: "Close", "aria-label": "Close the steps", onclick: () => showSteps(false) }, svg(UI_ICONS.close))),
          h("ol", {}, ...doc.steps.map((t) => h("li", {}, t))))
      : null;
    const stepsBtn = h("button", { class: "tb", type: "button", title: "Show the steps", "aria-label": "Show the steps", onclick: () => showSteps(stepsPanel?.hidden ?? false) }, svg(UI_ICONS.list));
    const showSteps = (on: boolean) => {
      if (!stepsPanel) return;
      stepsPanel.hidden = !on;
      stepsBtn.classList.toggle("active", on);
      stepsBtn.setAttribute("aria-pressed", String(on));
      const label = on ? "Hide the steps" : "Show the steps";
      stepsBtn.title = label;
      stepsBtn.setAttribute("aria-label", label);
    };

    // On a narrow screen (a phone) the extras go: pinch zooms, and the theme follows the phone.
    const extra = <T extends HTMLElement>(el: T): T => { el.classList.add("vx"); return el; };

    if (opts.controls) {
      const bar = h("div", { class: "vbar", role: "toolbar", "aria-label": "View controls" },
        h("div", { class: "seg", role: "group", "aria-label": "View mode" }, b3, b2),
        h("span", { class: "sep", role: "separator" }),
        btn("rotateL", "Rotate left", () => view.rotateView(-1)),
        playBtn,
        btn("rotateR", "Rotate right", () => view.rotateView(1)),
        extra(btn("minus", "Zoom out", () => view.zoomCentered(1 / 1.25))),
        extra(btn("plus", "Zoom in", () => view.zoomCentered(1.25))),
        btn("fit", "Fit the diagram to the window", () => view.fit()),
        h("span", { class: "sep", role: "separator" }),
        extra(themeBtn),
        stepsPanel ? stepsBtn : null,
        canFullscreen || embedded ? bigBtn : null,
      );
      wrap.append(h("div", { class: "vtitle" }, doc.title), bar);
      if (stepsPanel) wrap.append(stepsPanel);
    }
    refresh();
    refreshTheme();
    refreshBig();
    if (!embedded && innerWidth >= 900) showSteps(true); // a page of its own has room to show the steps

    // Look around: drag to pan. Zoom with Ctrl or Cmd and the wheel; a plain wheel zooms only when this page is
    // not inside another page, so it never steals the scroll of the page that embeds it.
    const top = window.self === window.top;
    let last: { x: number; y: number } | null = null;
    // Two fingers pinch to zoom (and the pair pans the board a little as it moves); one finger or the mouse pans.
    const touches = new Map<number, { x: number; y: number }>();
    const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const middle = () => { const [a, b] = [...touches.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    let pinch = 0;
    view.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      try { view.canvas.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
      view.holdRotation(true); // the turn waits while you hold the board
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { pinch = spread(); last = middle(); } else last = { x: e.clientX, y: e.clientY };
      stage.classList.add("dragging");
    });
    view.canvas.addEventListener("pointermove", (e) => {
      if (!last) return;
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) {
        const m = middle(), d = spread();
        if (pinch > 0 && d > 0) view.zoomAt(m.x, m.y, d / pinch);
        view.panScreen(last.x, last.y, m.x, m.y);
        pinch = d; last = m;
        return;
      }
      view.panScreen(last.x, last.y, e.clientX, e.clientY);
      last = { x: e.clientX, y: e.clientY };
    });
    const release = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size === 1) { const [rest] = [...touches.values()]; last = { ...rest }; pinch = 0; return; } // one finger left: carry on panning
      if (touches.size > 0) return;
      last = null; pinch = 0;
      view.holdRotation(false);
      stage.classList.remove("dragging");
      if (view.canvas.hasPointerCapture(e.pointerId)) view.canvas.releasePointerCapture(e.pointerId);
    };
    view.canvas.addEventListener("pointerup", release);
    view.canvas.addEventListener("pointercancel", release);
    view.canvas.addEventListener("wheel", (e) => {
      const zoomKey = e.ctrlKey || e.metaKey;
      if (!zoomKey && !top) return; // let the host page scroll
      e.preventDefault();
      view.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (zoomKey ? 0.01 : 0.0016)));
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" || e.key === "q") view.rotateView(-1);
      else if (e.key === "ArrowRight" || e.key === "e") view.rotateView(1);
      else if (e.key === " " && mode === "3d") { e.preventDefault(); playing = !playing; view.setAutoRotate(playing); refresh(); }
      else if (e.key === "f") view.fit();
      else if (e.key === "t") setMode(mode === "3d" ? "2d" : "3d");
      else if (e.key === "F") bigger();
    });
    if (opts.theme === "auto") window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { view.setTheme(readTheme()); refreshTheme(); });
  }).catch((e) => fail("This diagram could not be opened", e instanceof Error ? e.message : "Something went wrong."));
}

boot();
