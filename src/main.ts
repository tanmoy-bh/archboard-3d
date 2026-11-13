import "./style.css";
import { exampleDoc } from "./example";
import { Controller } from "./interaction/controller";
import { describeReport, importDrawio as readDrawio, listPages } from "./import/drawio";
import { parseDoc, stringifyDoc } from "./model/serialize";
import { Store } from "./model/store";
import { emptyDoc } from "./model/types";
import type { ViewMode } from "./scene/constants";
import { SceneView } from "./scene/sceneView";
import { applySavedTheme, readTheme, toggleTheme } from "./theme";
import { h } from "./ui/dom";
import { Inspector } from "./ui/inspector";
import { Legend } from "./ui/legend";
import { openExamples } from "./ui/examples";
import { Palette } from "./ui/palette";
import { openShare } from "./ui/share";
import { collapsible, panelHead, restorePanels } from "./ui/panels";
import { StepsPanel } from "./ui/steps";
import { Toolbar } from "./ui/toolbar";

const DOC_KEY = "archboard3d.doc";
const MODE_KEY = "archboard3d.mode";

function loadMode(): ViewMode {
  try { return localStorage.getItem(MODE_KEY) === "2d" ? "2d" : "3d"; } catch { return "3d"; }
}

function loadInitialDoc() {
  try {
    const saved = localStorage.getItem(DOC_KEY);
    if (saved) return parseDoc(saved);
  } catch { /* corrupt or blocked storage: start from the example */ }
  return exampleDoc();
}

function toast(message: string, kind: "info" | "error" = "info"): void {
  const el = h("div", { class: `toast ${kind}`, role: "status" }, message);
  document.body.append(el);
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3700);
}

function download(name: string, href: string): void {
  const a = h("a", { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "board";

function boot(): void {
  applySavedTheme();
  const app = document.getElementById("app")!;
  app.replaceChildren();

  const store = new Store(loadInitialDoc());
  const stage = h("main", { class: "stage" });
  const emptyHint = h("div", { class: "empty" }, h("strong", {}, "An empty board"), h("span", {}, "Pick a component on the left and click the floor, or load the example from the toolbar."));
  const hints = h("div", { class: "hints" }, "Drag to pan · Wheel to zoom · Q / E rotate · R auto-rotates · T switches 2D and 3D · Space + drag also pans");

  let view: SceneView;
  try {
    view = new SceneView(stage, store, readTheme());
  } catch (err) {
    app.append(h("div", { class: "fatal" }, h("h1", {}, "WebGL is not available"), h("p", {}, "Archboard 3D draws on a WebGL canvas. Enable hardware acceleration in your browser and reload."), h("pre", {}, String(err))));
    return;
  }

  let mode: ViewMode = loadMode();
  let gifBusy = false;
  view.setMode(mode, false);

  const controller = new Controller(view, store);
  const palette = new Palette(controller);
  const legend = new Legend(store);
  const inspector = new Inspector(store);
  const steps = new StepsPanel(store);

  const files = {
    newBoard() {
      if (store.itemCount > 0 && !confirm("Start a new empty board? Unsaved changes will be lost.")) return;
      store.load(emptyDoc());
      view.fit();
    },
    clearAll() {
      const n = store.itemCount;
      if (n === 0) { toast("The board is already empty."); return; }
      if (!confirm(`Remove all ${n} items (components, arrows and text boxes) from the board? You can undo this with Cmd/Ctrl+Z.`)) return;
      store.clearAll();
      view.fit();
      toast("Board cleared. Press Cmd/Ctrl+Z to bring it back.");
    },
    loadExample() {
      openExamples({
        page: location.href,
        open: (doc) => { store.replace(doc); view.fit(); toast(`Opened "${doc.title}". Undo brings your previous board back.`); },
        fail: (message) => toast(message, "error"),
      });
    },
    share() {
      openShare({ store, toast, openDoc: (doc) => { store.replace(doc); view.fit(); } });
    },
    saveBoard() {
      const url = URL.createObjectURL(new Blob([stringifyDoc(store.doc)], { type: "application/json" }));
      download(`${slug(store.doc.title)}.archboard.json`, url);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Board saved as JSON.");
    },
    openBoard() {
      const input = h("input", { type: "file", accept: ".json,application/json" });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          store.load(parseDoc(await file.text()));
          view.fit();
          toast(`Opened "${store.doc.title}".`);
        } catch (e) {
          toast(e instanceof Error ? e.message : "Could not open that file.", "error");
        }
      });
      input.click();
    },
    importDrawio() {
      const input = h("input", { type: "file", accept: ".drawio,.xml,text/xml,application/xml" });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          if (file.size > 20 * 1048576) throw new Error("That file is larger than 20 MB, too big to import.");
          const text = await file.text();
          const names = await listPages(text);
          let index = 0;
          if (names.length > 1) {
            const answer = prompt(`This file has ${names.length} pages:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\nWhich page should be imported? Type its number.`, "1");
            if (answer === null) return;
            index = Number(answer) - 1;
            if (!Number.isInteger(index) || index < 0 || index >= names.length) throw new Error("That is not one of the pages.");
          }
          const { doc, report } = await readDrawio(text, index);
          if (store.itemCount > 0 && !confirm(`Replace the current board with "${report.page}" from draw.io? You can undo this with Cmd/Ctrl+Z.`)) return;
          const base = file.name.replace(/\.(drawio|xml)$/i, "");
          doc.title = names.length > 1 ? `${base}: ${report.page}` : base || report.page;
          store.replace(doc);
          view.fit();
          toast(describeReport(report));
        } catch (e) {
          toast(e instanceof Error ? e.message : "Could not import that file.", "error");
        }
      });
      input.click();
    },
    exportPng() {
      try {
        download(`${slug(store.doc.title)}.png`, view.exportPng());
        toast("PNG exported.");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not export the image.", "error");
      }
    },
    async exportGif() {
      if (gifBusy) return;
      gifBusy = true;
      const text = h("p", {}, "Starting");
      const bar = h("progress", { max: 100, value: 0 });
      const overlay = h("div", { class: "busy", role: "alert" }, h("div", { class: "busy-card" }, h("strong", {}, "Making your GIF"), text, bar, h("span", { class: "muted" }, "Please wait, large GIFs take a minute.")));
      document.body.append(overlay);
      const block = (e: KeyboardEvent) => { e.stopImmediatePropagation(); e.preventDefault(); };
      window.addEventListener("keydown", block, true); // keep shortcuts from editing the board mid-export
      try {
        const blob = await view.exportGif({
          stillSeconds: 3, stillFps: 12, turnFps: 8, width: 1200,
          onProgress: (done, total) => { bar.value = Math.round((done / total) * 100); text.textContent = `Rendering frame ${done} of ${total}`; },
        });
        const url = URL.createObjectURL(blob);
        download(`${slug(store.doc.title)}.gif`, url);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast(`GIF exported (${(blob.size / 1048576).toFixed(1)} MB).`);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not make the GIF.", "error");
      } finally {
        window.removeEventListener("keydown", block, true);
        overlay.remove();
        gifBusy = false;
      }
    },
    toggleAutoRotate() {
      if (mode !== "3d") { toast("Auto-rotate works in the 3D view. Press T to switch."); return; }
      view.setAutoRotate(!view.autoRotate);
      toolbar.refresh(readTheme().dark, mode);
      toast(view.autoRotate ? "Auto-rotate on. Press R to stop." : "Auto-rotate off.");
    },
    toggleTheme() {
      toggleTheme();
      applyTheme();
    },
    setMode(next: ViewMode) {
      if (next === mode) return;
      mode = next;
      try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
      view.setMode(mode);
      const theme = readTheme();
      palette.build(mode, theme.fg);
      legend.update(mode, theme.fg);
      toolbar.refresh(theme.dark, mode);
      toast(mode === "3d" ? "3D board: isometric view with 3D models." : "2D board: flat top-down view with 2D glyphs.");
    },
  };

  const toolbar = new Toolbar(store, controller, view, files);

  stage.append(legend.el, hints, emptyHint);
  collapsible(inspector.el, "sec:inspector");
  collapsible(steps.el, "sec:steps");
  const right = h("aside", { class: "sidebar", "aria-label": "Details" }, panelHead("Details", "panel:right", "Show details"), h("div", { class: "panel-body" }, inspector.el, steps.el));
  const workspace = h("div", { class: "workspace" }, palette.el, stage, right);
  app.append(toolbar.el, workspace);
  restorePanels(workspace);

  function applyTheme(): void {
    const theme = readTheme();
    view.setTheme(theme);
    palette.build(mode, theme.fg);
    legend.update(mode, theme.fg);
    toolbar.refresh(theme.dark, mode);
  }

  let saveTimer: number | undefined;
  const refreshAll = () => {
    const theme = readTheme();
    toolbar.refresh(theme.dark, mode);
    inspector.update();
    steps.update();
    legend.update(mode, theme.fg);
    emptyHint.hidden = store.itemCount > 0;
    document.title = `${store.doc.title} · Archboard 3D`;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(DOC_KEY, stringifyDoc(store.doc)); } catch { /* storage full or blocked */ }
    }, 400);
  };
  store.subscribe(refreshAll);
  controller.onModeChange = () => { toolbar.refresh(readTheme().dark, mode); palette.refresh(); };
  controller.onToggleAutoRotate = () => files.toggleAutoRotate();
  controller.onToggleMode = () => files.setMode(mode === "3d" ? "2d" : "3d");
  controller.onFocusLabel = () => inspector.focusLabel();

  palette.build(mode, readTheme().fg);
  refreshAll();
  view.resizeNow(); // the stage only has a size now that it is in the page
  view.fit();

  // Follow the operating system theme unless the user picked one explicitly.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());
  window.addEventListener("beforeunload", () => {
    try { localStorage.setItem(DOC_KEY, stringifyDoc(store.doc)); } catch { /* ignore */ }
  });

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__archboard = { store, view, controller };
}

// Access is controlled on the server (see functions/_middleware.js): the page is only sent after the
// passphrase has been accepted, so the app itself just starts.
applySavedTheme();
boot();
