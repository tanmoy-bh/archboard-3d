import { DocData, EdgeData, IconKey, NODE_MIN_GAP, NodeData, TextData, emptyDoc, genId, snap } from "./types";

export type ChangeKind = "doc" | "selection";
export type Listener = (kind: ChangeKind) => void;

const HISTORY_LIMIT = 200;
const COALESCE_MS = 900;

/**
 * Document + selection + undo/redo. No DOM and no Three.js in here so it can be unit tested.
 * History is snapshot based: documents are small, and snapshots keep undo trivially correct.
 */
export class Store {
  doc: DocData;
  selection = new Set<string>();

  private undoStack: DocData[] = [];
  private redoStack: DocData[] = [];
  private listeners = new Set<Listener>();
  private txBase: DocData | null = null;
  private lastKey: string | null = null;
  private lastKeyAt = 0;

  constructor(initial: DocData = emptyDoc()) {
    this.doc = structuredClone(initial);
    this.doc.texts ??= [];
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(kind: ChangeKind): void {
    for (const fn of [...this.listeners]) fn(kind);
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  node(id: string): NodeData | undefined { return this.doc.nodes.find((n) => n.id === id); }
  edge(id: string): EdgeData | undefined { return this.doc.edges.find((e) => e.id === id); }
  textBox(id: string): TextData | undefined { return this.doc.texts.find((t) => t.id === id); }

  /** Everything the user can put on the board: tiles, arrows and text boxes. */
  get itemCount(): number { return this.doc.nodes.length + this.doc.edges.length + this.doc.texts.length; }

  // ---------------------------------------------------------------- mutation

  /** Apply a change and record it in history. Same `coalesceKey` within ~1s merges into one undo step. */
  mutate(fn: (d: DocData) => void, coalesceKey?: string): void {
    const now = Date.now();
    const merge = !!coalesceKey && coalesceKey === this.lastKey && now - this.lastKeyAt < COALESCE_MS;
    if (!merge) this.pushUndo(structuredClone(this.doc));
    this.redoStack = [];
    this.lastKey = coalesceKey ?? null;
    this.lastKeyAt = now;
    fn(this.doc);
    this.afterDocChange();
  }

  /** Start a continuous interaction (dragging). Changes made through `transient` form one undo step. */
  beginTransient(): void {
    if (!this.txBase) this.txBase = structuredClone(this.doc);
  }

  transient(fn: (d: DocData) => void): void {
    fn(this.doc);
    this.emit("doc");
  }

  endTransient(commit = true): void {
    const base = this.txBase;
    if (!base) return;
    this.txBase = null;
    this.lastKey = null;
    if (!commit) {
      this.doc = base;
      this.afterDocChange();
      return;
    }
    if (JSON.stringify(base) !== JSON.stringify(this.doc)) {
      this.pushUndo(base);
      this.redoStack = [];
    }
  }

  private pushUndo(snapshot: DocData): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(structuredClone(this.doc));
    this.doc = prev;
    this.lastKey = null;
    this.afterDocChange();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(structuredClone(this.doc));
    this.doc = next;
    this.lastKey = null;
    this.afterDocChange();
  }

  /** Replace the whole document (open file, new, example). Clears history. */
  load(doc: DocData): void {
    this.doc = structuredClone(doc);
    this.doc.texts ??= []; // boards built before text boxes existed
    this.undoStack = [];
    this.redoStack = [];
    this.txBase = null;
    this.lastKey = null;
    this.selection.clear();
    this.emit("selection");
    this.emit("doc");
  }

  private afterDocChange(): void {
    const changed = this.pruneSelection();
    this.emit("doc");
    if (changed) this.emit("selection");
  }

  private pruneSelection(): boolean {
    const ids = new Set<string>([...this.doc.nodes.map((n) => n.id), ...this.doc.edges.map((e) => e.id), ...this.doc.texts.map((t) => t.id)]);
    let changed = false;
    for (const id of [...this.selection]) {
      if (!ids.has(id)) { this.selection.delete(id); changed = true; }
    }
    return changed;
  }

  // --------------------------------------------------------------- selection

  select(ids: string[], additive = false): void {
    if (!additive) this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.emit("selection");
  }

  toggleSelect(id: string): void {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit("selection");
  }

  clearSelection(): void {
    if (this.selection.size === 0) return;
    this.selection.clear();
    this.emit("selection");
  }

  selectAll(): void {
    this.selection = new Set([...this.doc.nodes.map((n) => n.id), ...this.doc.texts.map((t) => t.id)]);
    this.emit("selection");
  }

  // ----------------------------------------------------------------- queries

  /** True when a node of the given grid position would not overlap any other node. */
  isFree(gx: number, gy: number, ignore: ReadonlySet<string> | string[] = []): boolean {
    const skip = ignore instanceof Set ? ignore : new Set(ignore);
    return !this.doc.nodes.some(
      (n) => !skip.has(n.id) && Math.abs(n.gx - gx) < NODE_MIN_GAP && Math.abs(n.gy - gy) < NODE_MIN_GAP,
    );
  }

  /** Nearest free grid position to (gx, gy), searching outwards in half cell steps. */
  nearestFree(gx: number, gy: number): { gx: number; gy: number } {
    gx = snap(gx); gy = snap(gy);
    if (this.isFree(gx, gy)) return { gx, gy };
    for (let r = 1; r <= 40; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = gx + dx * 0.5, y = gy + dy * 0.5;
          if (this.isFree(x, y)) return { gx: x, gy: y };
        }
      }
    }
    return { gx, gy };
  }

  // ----------------------------------------------------------------- actions

  addNode(icon: IconKey, gx: number, gy: number, label: string): string {
    const id = genId("n");
    this.mutate((d) => { d.nodes.push({ id, gx: snap(gx), gy: snap(gy), icon, label }); });
    this.select([id]);
    return id;
  }

  /** Returns the new edge id, or null for self loops and duplicates. */
  addEdge(from: string, to: string): string | null {
    if (from === to || !this.node(from) || !this.node(to)) return null;
    if (this.doc.edges.some((e) => e.from === from && e.to === to)) return null;
    const id = genId("e");
    this.mutate((d) => { d.edges.push({ id, from, to }); });
    this.select([id]);
    return id;
  }

  /** Add a text box centred on a grid position and select it. */
  addText(gx: number, gy: number, text = "Text", size: TextData["size"] = "m"): string {
    const id = genId("t");
    this.mutate((d) => { d.texts.push({ id, gx: snap(gx), gy: snap(gy), text, size }); });
    this.select([id]);
    return id;
  }

  /** Remove every tile, arrow and text box. The title and step list stay. One undo step brings it all back. */
  clearAll(): boolean {
    if (this.itemCount === 0) return false;
    this.mutate((d) => { d.nodes = []; d.edges = []; d.texts = []; });
    return true;
  }

  deleteSelected(): void {
    if (this.selection.size === 0) return;
    const sel = new Set(this.selection);
    this.mutate((d) => {
      d.texts = d.texts.filter((t) => !sel.has(t.id));
      d.nodes = d.nodes.filter((n) => !sel.has(n.id));
      d.edges = d.edges.filter((e) => !sel.has(e.id) && !sel.has(e.from) && !sel.has(e.to));
    });
  }

  /** Copy the selected nodes (and the edges between them) one cell down and right. */
  duplicateSelected(): void {
    const picked = this.doc.nodes.filter((n) => this.selection.has(n.id));
    const pickedTexts = this.doc.texts.filter((t) => this.selection.has(t.id));
    if (picked.length === 0 && pickedTexts.length === 0) return;
    const map = new Map<string, string>();
    const created: string[] = [];
    this.mutate((d) => {
      for (const n of picked) {
        const id = genId("n");
        map.set(n.id, id);
        created.push(id);
        d.nodes.push({ ...n, id, gx: n.gx + 1, gy: n.gy + 1 });
      }
      for (const e of d.edges.filter((e) => map.has(e.from) && map.has(e.to))) {
        d.edges.push({ ...e, id: genId("e"), from: map.get(e.from)!, to: map.get(e.to)! });
      }
      for (const t of pickedTexts) {
        const id = genId("t");
        created.push(id);
        d.texts.push({ ...t, id, gx: t.gx + 1, gy: t.gy + 1 });
      }
    });
    this.select(created);
  }

  reverseEdge(id: string): void {
    this.mutate((d) => {
      const e = d.edges.find((x) => x.id === id);
      if (e) [e.from, e.to] = [e.to, e.from];
    });
  }
}
