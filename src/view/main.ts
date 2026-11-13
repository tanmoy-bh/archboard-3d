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

    if (opts.controls) {
      const bar = h("div", { class: "vbar", role: "toolbar", "aria-label": "View controls" },
        h("div", { class: "seg", role: "group", "aria-label": "View mode" }, b3, b2),
        h("span", { class: "sep", role: "separator" }),
        btn("rotateL", "Rotate left", () => view.rotateView(-1)),
        playBtn,
        btn("rotateR", "Rotate right", () => view.rotateView(1)),
        btn("fit", "Fit the diagram to the window", () => view.fit()),
      );
      wrap.append(h("div", { class: "vtitle" }, doc.title), bar);
    }
    refresh();

    // Look around: drag to pan. Zoom with Ctrl or Cmd and the wheel; a plain wheel zooms only when this page is
    // not inside another page, so it never steals the scroll of the page that embeds it.
    const top = window.self === window.top;
    let last: { x: number; y: number } | null = null;
    view.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      view.canvas.setPointerCapture(e.pointerId);
      view.holdRotation(true); // the turn waits while you hold the board
      last = { x: e.clientX, y: e.clientY };
      stage.classList.add("dragging");
    });
    view.canvas.addEventListener("pointermove", (e) => {
      if (!last) return;
      view.panScreen(last.x, last.y, e.clientX, e.clientY);
      last = { x: e.clientX, y: e.clientY };
    });
    const release = (e: PointerEvent) => {
      last = null;
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
    });
    if (opts.theme === "auto") window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => view.setTheme(readTheme()));
  }).catch((e) => fail("This diagram could not be opened", e instanceof Error ? e.message : "Something went wrong."));
}

boot();
