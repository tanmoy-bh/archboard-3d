/** Building and reading the links of the read-only viewer. Pure functions, no browser needed. */

export type ViewTheme = "auto" | "light" | "dark";

export interface ViewOpts {
  mode?: "3d" | "2d";
  /** Start with the board turning (3D only). The viewer's default is on. */
  play?: boolean;
  theme?: ViewTheme;
  /** Hide the button bar. */
  controls?: boolean;
}

export type ViewSource =
  | { kind: "packed"; data: string }
  | { kind: "id"; id: string }
  | { kind: "name"; name: string };

export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const ID_RE = /^[a-z0-9]{8,32}$/;

/** Where the viewer lives, relative to the page the editor is on (`.../archboard-3d/` gives `.../archboard-3d/view/`). */
export const viewerBase = (pageHref: string): string => new URL("view/", pageHref).toString();

/** Where the short link of a published board lives. */
export const shortLink = (pageHref: string, id: string, opts: ViewOpts = {}): string => {
  const u = new URL(`v/${id}`, pageHref);
  applyOpts(u.searchParams, opts);
  return u.toString();
};

function applyOpts(q: URLSearchParams, o: ViewOpts): void {
  if (o.mode === "2d") q.set("mode", "2d");
  if (o.play === false) q.set("play", "0");
  if (o.theme === "light" || o.theme === "dark") q.set("theme", o.theme);
  if (o.controls === false) q.set("controls", "0");
}

export function packedLink(pageHref: string, packed: string, opts: ViewOpts = {}): string {
  const u = new URL(viewerBase(pageHref));
  applyOpts(u.searchParams, opts);
  return `${u.toString()}#d=${packed}`;
}

export function namedLink(pageHref: string, name: string, opts: ViewOpts = {}): string {
  const u = new URL(viewerBase(pageHref));
  u.searchParams.set("d", name);
  applyOpts(u.searchParams, opts);
  return u.toString();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ready to paste into a page. */
export function embedCode(src: string, title: string, height = 520): string {
  return `<iframe src="${esc(src)}" title="${esc(title || "Architecture diagram")}" width="100%" height="${Math.round(height)}" style="border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe>`;
}

export interface ViewParams { source: ViewSource | null; opts: Required<Omit<ViewOpts, "theme">> & { theme: ViewTheme } }

/** Read what the viewer was asked to show from its address. Unknown or malformed values are ignored. */
export function parseViewParams(search: string, hash: string): ViewParams {
  const q = new URLSearchParams(search);
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  let source: ViewSource | null = null;
  const packed = h.get("d");
  const id = q.get("id"), name = q.get("d");
  if (packed) source = { kind: "packed", data: packed };
  else if (id && ID_RE.test(id)) source = { kind: "id", id };
  else if (name && NAME_RE.test(name)) source = { kind: "name", name };
  const theme = q.get("theme");
  return {
    source,
    opts: {
      mode: q.get("mode") === "2d" ? "2d" : "3d",
      play: q.get("play") !== "0",
      theme: theme === "light" || theme === "dark" ? theme : "auto",
      controls: q.get("controls") !== "0",
    },
  };
}
