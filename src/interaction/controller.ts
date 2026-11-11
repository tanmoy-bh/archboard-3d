import type { Store } from "../model/store";
import { IconKey, ZONE_COLORS, ZONE_MIN, genId, snap } from "../model/types";
import { zoneMembers } from "../model/zones";
import { ICON_NAMES } from "../glyphs/catalog";
import { SP } from "../scene/constants";
import type { SceneView } from "../scene/sceneView";
import { isTypingTarget } from "../ui/dom";

export type Tool = "select" | "connect" | "text" | "zone";

const DRAG_THRESHOLD = 4;

type Drag =
  | { kind: "none" }
  | { kind: "pan"; x: number; y: number; moved: boolean; clearOnClick: boolean }
  | { kind: "nodes"; startGX: number; startGZ: number; origins: Map<string, { gx: number; gy: number }>; moved: boolean; x: number; y: number }
  | { kind: "zone-draw"; id: string; startGX: number; startGY: number; moved: boolean; x: number; y: number }
  | { kind: "zone-resize"; id: string; corner: number; fixedX: number; fixedY: number; moved: boolean; x: number; y: number };

/** Turns pointer and keyboard input into edits on the Store and camera moves on the SceneView. */
export class Controller {
  tool: Tool = "select";
  /** Icon armed for placement; the next click on the floor drops one. */
  armed: IconKey | null = null;

  /** Notifies the UI about tool or armed changes. */
  onModeChange: () => void = () => {};
  onFocusLabel: () => void = () => {};
  /** Called when the user presses T to switch between the 3D and 2D board. */
  onToggleMode: () => void = () => {};
  onToggleAutoRotate: () => void = () => {};

  private drag: Drag = { kind: "none" };
  private connectFrom: string | null = null;
  private spaceDown = false;
  /** A new text box was just placed: move the keyboard focus to its text field once the click is over. */
  private focusOnUp = false;
  private last = { x: 0, y: 0 };

  constructor(private view: SceneView, private store: Store) {
    const c = view.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("pointerleave", this.onLeave);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("dblclick", this.onDouble);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("dragover", this.onDragOver);
    c.addEventListener("dragleave", () => this.view.showGhost(null));
    c.addEventListener("drop", this.onDrop);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
  }

  // ------------------------------------------------------------------ modes

  setTool(tool: Tool): void {
    this.tool = tool;
    this.cancelTransient();
    this.onModeChange();
  }

  arm(icon: IconKey | null): void {
    this.armed = icon;
    if (!icon) this.view.showGhost(null);
    this.cancelConnect();
    this.onModeChange();
  }

  private cancelConnect(): void {
    this.connectFrom = null;
    this.view.showRubber(null, null);
  }

  private cancelTransient(): void {
    this.cancelConnect();
    this.view.showGhost(null);
    this.armed = null;
  }

  private updateCursor(hover: boolean): void {
    const c = this.view.canvas;
    if (this.drag.kind === "pan") c.style.cursor = "grabbing";
    else if (this.armed) c.style.cursor = "copy";
    else if (this.tool === "connect") c.style.cursor = hover ? "crosshair" : "default";
    else if (this.tool === "text") c.style.cursor = "text";
    else if (this.tool === "zone") c.style.cursor = "crosshair";
    else c.style.cursor = hover ? "pointer" : "grab";
  }

  // ---------------------------------------------------------------- pointer

  private onDown = (e: PointerEvent): void => {
    this.view.canvas.setPointerCapture(e.pointerId);
    this.view.holdRotation(true); // auto-rotate waits while the pointer is down
    this.last = { x: e.clientX, y: e.clientY };

    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.drag = { kind: "pan", x: e.clientX, y: e.clientY, moved: false, clearOnClick: false };
      this.updateCursor(false);
      return;
    }
    if (e.button !== 0) return;

    // placing an armed glyph
    if (this.armed) {
      const g = this.view.groundPoint(e.clientX, e.clientY);
      if (g) this.place(this.armed, g.x / SP, g.z / SP);
      if (!e.shiftKey) this.arm(null);
      return;
    }

    // text tool: a click on the floor drops a text box there
    if (this.tool === "text") {
      const g = this.view.groundPoint(e.clientX, e.clientY);
      if (g) {
        this.store.addText(g.x / SP, g.z / SP);
        this.focusOnUp = true;
      }
      if (!e.shiftKey) this.setTool("select");
      return;
    }

    // zone tool: press, drag out a rectangle, release. A plain click drops a default sized zone.
    if (this.tool === "zone") {
      const g = this.view.groundPoint(e.clientX, e.clientY);
      if (g) {
        const gx = snap(g.x / SP), gy = snap(g.z / SP);
        const id = genId("z");
        this.store.beginTransient();
        this.store.transient((d) => { d.zones.push({ id, gx, gy, w: ZONE_MIN, h: ZONE_MIN, label: "Zone", color: ZONE_COLORS[d.zones.length % ZONE_COLORS.length] }); });
        this.store.select([id]);
        this.drag = { kind: "zone-draw", id, startGX: gx, startGY: gy, moved: false, x: e.clientX, y: e.clientY };
      }
      return;
    }

    // a corner handle of the selected zone starts a resize
    if (this.tool === "select" && this.store.selection.size === 1) {
      const [only] = [...this.store.selection];
      const z = this.store.zone(only);
      const corner = z ? this.view.pickZoneCorner(only, e.clientX, e.clientY) : null;
      if (z && corner !== null) {
        const right = corner & 1, far = corner >> 1;
        this.drag = { kind: "zone-resize", id: only, corner, fixedX: right ? z.gx : z.gx + z.w, fixedY: far ? z.gy : z.gy + z.h, moved: false, x: e.clientX, y: e.clientY };
        return;
      }
    }

    const nodeId = this.view.pickNode(e.clientX, e.clientY);

    if (this.tool === "connect") {
      if (nodeId && !this.connectFrom) {
        this.connectFrom = nodeId;
        this.store.select([nodeId]);
      } else if (!nodeId) {
        this.cancelConnect();
        this.drag = { kind: "pan", x: e.clientX, y: e.clientY, moved: false, clearOnClick: true };
      }
      return;
    }

    // select tool: text boxes are drawn on top, so they are picked first
    const edgeId = nodeId || this.view.pickText(e.clientX, e.clientY) ? null : this.view.pickEdge(e.clientX, e.clientY);
    const itemId = this.view.pickText(e.clientX, e.clientY) ?? nodeId ?? (edgeId ? null : this.view.pickZone(e.clientX, e.clientY));
    if (itemId) {
      if (e.shiftKey) this.store.toggleSelect(itemId);
      else if (!this.store.selection.has(itemId)) this.store.select([itemId]);
      const g = this.view.groundPoint(e.clientX, e.clientY);
      const origins = this.movingOrigins(!e.altKey);
      if (g && origins.size > 0) {
        this.drag = { kind: "nodes", startGX: g.x / SP, startGZ: g.z / SP, origins, moved: false, x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (edgeId) {
      if (e.shiftKey) this.store.toggleSelect(edgeId);
      else this.store.select([edgeId]);
      return;
    }
    this.drag = { kind: "pan", x: e.clientX, y: e.clientY, moved: false, clearOnClick: !e.shiftKey };
    this.updateCursor(false);
  };

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (d.kind === "pan") {
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD) d.moved = true;
      if (d.moved) this.view.panScreen(this.last.x, this.last.y, e.clientX, e.clientY);
      this.last = { x: e.clientX, y: e.clientY };
      return;
    }
    this.last = { x: e.clientX, y: e.clientY };

    if (d.kind === "nodes") {
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD) {
        d.moved = true;
        this.store.beginTransient();
      }
      if (d.moved) this.dragNodes(d, e);
      return;
    }

    if (d.kind === "zone-draw" || d.kind === "zone-resize") {
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD) d.moved = true;
      if (d.moved) this.dragZone(d, e);
      return;
    }

    if (this.armed) {
      const g = this.view.groundPoint(e.clientX, e.clientY);
      if (g) {
        const gx = snap(g.x / SP), gy = snap(g.z / SP);
        this.view.showGhost(this.armed, gx, gy, this.store.isFree(gx, gy));
      }
      this.updateCursor(false);
      return;
    }

    const textId = this.tool === "select" ? this.view.pickText(e.clientX, e.clientY) : null;
    const nodeId = textId ? null : this.view.pickNode(e.clientX, e.clientY);
    const edgeId = nodeId || textId ? null : this.view.pickEdge(e.clientX, e.clientY);
    const zoneId = this.tool === "select" && !nodeId && !textId && !edgeId ? this.view.pickZone(e.clientX, e.clientY) : null;
    this.view.setHover(nodeId, edgeId, textId, zoneId);
    this.updateCursor(!!(nodeId || edgeId || textId || zoneId));

    if (this.connectFrom) {
      const from = this.store.node(this.connectFrom);
      const g = this.view.groundPoint(e.clientX, e.clientY);
      if (from && g) this.view.showRubber({ x: from.gx * SP, z: from.gy * SP }, g);
    }
  };

  private dragNodes(d: Extract<Drag, { kind: "nodes" }>, e: PointerEvent): void {
    const g = this.view.groundPoint(e.clientX, e.clientY);
    if (!g) return;
    const dgx = snap(g.x / SP - d.startGX), dgy = snap(g.z / SP - d.startGZ);
    const ids = new Set(d.origins.keys());
    for (const [id, o] of d.origins) {
      // tiles must keep a gap from each other; text boxes and zones may sit anywhere
      if (this.store.node(id) && !this.store.isFree(o.gx + dgx, o.gy + dgy, ids)) return; // blocked: keep the last valid position
    }
    this.store.transient((doc) => {
      for (const n of [...doc.nodes, ...doc.texts, ...doc.zones]) {
        const o = d.origins.get(n.id);
        if (o) { n.gx = o.gx + dgx; n.gy = o.gy + dgy; }
      }
    });
  }

  /**
   * Starting positions of everything a drag or nudge moves: the selected tiles, text boxes and zones, and
   * (unless `withMembers` is false, the Alt drag) whatever sits inside each selected zone.
   */
  private movingOrigins(withMembers: boolean): Map<string, { gx: number; gy: number }> {
    const doc = this.store.doc, sel = this.store.selection;
    const ids = new Set<string>(sel);
    if (withMembers) {
      for (const z of doc.zones) {
        if (!sel.has(z.id)) continue;
        const m = zoneMembers(doc, z.id);
        for (const id of [...m.nodes, ...m.texts, ...m.zones]) ids.add(id);
      }
    }
    const origins = new Map<string, { gx: number; gy: number }>();
    for (const n of [...doc.nodes, ...doc.texts, ...doc.zones]) if (ids.has(n.id)) origins.set(n.id, { gx: n.gx, gy: n.gy });
    return origins;
  }

  private dragZone(d: Extract<Drag, { kind: "zone-draw" | "zone-resize" }>, e: PointerEvent): void {
    const g = this.view.groundPoint(e.clientX, e.clientY);
    if (!g) return;
    const mx = snap(g.x / SP), my = snap(g.z / SP);
    const fx = d.kind === "zone-draw" ? d.startGX : d.fixedX, fy = d.kind === "zone-draw" ? d.startGY : d.fixedY;
    let x0 = Math.min(mx, fx), x1 = Math.max(mx, fx), y0 = Math.min(my, fy), y1 = Math.max(my, fy);
    if (x1 - x0 < ZONE_MIN) { if (mx < fx) x0 = fx - ZONE_MIN; else x1 = fx + ZONE_MIN; }
    if (y1 - y0 < ZONE_MIN) { if (my < fy) y0 = fy - ZONE_MIN; else y1 = fy + ZONE_MIN; }
    this.store.transient((doc) => {
      const z = doc.zones.find((q) => q.id === d.id);
      if (z) { z.gx = x0; z.gy = y0; z.w = x1 - x0; z.h = y1 - y0; }
    });
  }

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    this.drag = { kind: "none" };
    this.view.holdRotation(false);
    if (this.view.canvas.hasPointerCapture(e.pointerId)) this.view.canvas.releasePointerCapture(e.pointerId);

    if (d.kind === "zone-draw") {
      if (!d.moved) {
        // a plain click: a default sized zone centred on the click
        this.store.transient((doc) => {
          const z = doc.zones.find((q) => q.id === d.id);
          if (z) { z.gx = d.startGX - 3; z.gy = d.startGY - 2; z.w = 6; z.h = 4; }
        });
      }
      this.store.endTransient(true);
      if (!e.shiftKey) this.setTool("select");
    } else if (d.kind === "zone-resize") {
      this.store.endTransient(true);
    } else if (d.kind === "nodes") {
      if (d.moved) this.store.endTransient(true);
      else if (!e.shiftKey && this.store.selection.size > 1) {
        const id = this.view.pickText(e.clientX, e.clientY) ?? this.view.pickNode(e.clientX, e.clientY) ?? this.view.pickZone(e.clientX, e.clientY);
        if (id) this.store.select([id]); // click without dragging inside a multi selection narrows it
      }
    } else if (d.kind === "pan" && !d.moved && d.clearOnClick) {
      this.store.clearSelection();
    }

    // Connect tool: releasing (or clicking) on another tile finishes the arrow. Releasing on the source
    // itself keeps it pending, so click-then-click works as well as drag-and-release.
    if (this.tool === "connect" && this.connectFrom) {
      const target = this.view.pickNode(e.clientX, e.clientY);
      if (target && target !== this.connectFrom) {
        this.store.addEdge(this.connectFrom, target);
        this.cancelConnect();
      }
    }
    if (this.focusOnUp) {
      this.focusOnUp = false;
      this.onFocusLabel();
    }
    this.updateCursor(false);
  };

  private onLeave = (): void => {
    this.view.setHover(null, null);
    if (this.armed) this.view.showGhost(null);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
    this.view.zoomAt(e.clientX, e.clientY, factor);
  };

  private onDouble = (e: MouseEvent): void => {
    if (this.tool !== "select") return;
    const id = this.view.pickText(e.clientX, e.clientY) ?? this.view.pickNode(e.clientX, e.clientY) ?? this.view.pickZone(e.clientX, e.clientY);
    if (id) { this.store.select([id]); this.onFocusLabel(); return; }
    const edge = this.view.pickEdge(e.clientX, e.clientY);
    if (edge) { this.store.select([edge]); this.onFocusLabel(); }
  };

  // -------------------------------------------------------- drag and drop in

  private onDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer?.types.includes("application/x-archboard-icon")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const icon = this.dragIcon();
    const g = this.view.groundPoint(e.clientX, e.clientY);
    if (icon && g) {
      const gx = snap(g.x / SP), gy = snap(g.z / SP);
      this.view.showGhost(icon, gx, gy, this.store.isFree(gx, gy));
    }
  };

  private draggingIcon: IconKey | null = null;
  setDraggingIcon(icon: IconKey | null): void { this.draggingIcon = icon; }
  private dragIcon(): IconKey | null { return this.draggingIcon; }

  private onDrop = (e: DragEvent): void => {
    const key = e.dataTransfer?.getData("application/x-archboard-icon") as IconKey | undefined;
    this.view.showGhost(null);
    if (!key) return;
    e.preventDefault();
    const g = this.view.groundPoint(e.clientX, e.clientY);
    if (g) this.place(key, g.x / SP, g.z / SP);
    this.draggingIcon = null;
  };

  /** Drop a new component at (or next to) a grid position. */
  place(icon: IconKey, gx: number, gy: number): void {
    const p = this.store.nearestFree(gx, gy);
    this.store.addNode(icon, p.gx, p.gy, ICON_NAMES[icon]);
  }

  // --------------------------------------------------------------- keyboard

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") { this.spaceDown = false; this.updateCursor(false); }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) {
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (e.code === "Space") { this.spaceDown = true; e.preventDefault(); return; }
    if (mod && key === "z") { e.preventDefault(); e.shiftKey ? this.store.redo() : this.store.undo(); return; }
    if (mod && key === "y") { e.preventDefault(); this.store.redo(); return; }
    if (mod && key === "d") { e.preventDefault(); this.store.duplicateSelected(); return; }
    if (mod && key === "a") { e.preventDefault(); this.store.selectAll(); return; }
    if (mod) return; // leave other browser shortcuts alone

    switch (key) {
      case "v": this.setTool("select"); break;
      case "c": this.setTool("connect"); break;
      case "x": this.setTool("text"); break;
      case "z": this.setTool("zone"); break;
      case "q": this.view.rotateView(-1); break;
      case "e": this.view.rotateView(1); break;
      case "r": this.onToggleAutoRotate(); break;
      case "f": this.view.fit(); break;
      case "t": this.onToggleMode(); break;
      case "=": case "+": this.view.zoomCentered(1.2); break;
      case "-": case "_": this.view.zoomCentered(1 / 1.2); break;
      case "delete": case "backspace": e.preventDefault(); this.store.deleteSelected(); break;
      case "enter": this.onFocusLabel(); break;
      case "escape":
        if (this.armed || this.connectFrom) { this.cancelTransient(); this.onModeChange(); }
        else if (this.tool !== "select") this.setTool("select");
        else this.store.clearSelection();
        break;
      case "arrowleft": case "arrowright": case "arrowup": case "arrowdown": this.nudge(key, e.shiftKey); e.preventDefault(); break;
      default: break;
    }
  };

  private nudge(key: string, big: boolean): void {
    const step = big ? 1 : 0.5;
    const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
    const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
    const ids = new Set(this.movingOrigins(true).keys());
    if (ids.size === 0) return;
    const movingNodes = this.store.doc.nodes.filter((n) => ids.has(n.id));
    if (!movingNodes.every((n) => this.store.isFree(n.gx + dx, n.gy + dy, ids))) return;
    this.store.mutate((d) => {
      for (const n of [...d.nodes, ...d.texts, ...d.zones]) if (ids.has(n.id)) { n.gx += dx; n.gy += dy; }
    }, "nudge");
  }
}
