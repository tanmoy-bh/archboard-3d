/** Colour tokens come from CSS variables so the 3D scene and the DOM always agree. */
export interface Theme {
  board: string;
  tile: string;
  wire: string;
  step: string;
  accent: string;
  fg: string;
  muted: string;
  dark: boolean;
}

export const FONT = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const board = v("--board", "#17191e");
  const c = parseInt(board.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const lum = (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;
  return {
    board,
    tile: v("--tile", "#6b7180"),
    wire: v("--wire", "#aab0bb"),
    step: v("--step", "#9b7cf0"),
    accent: v("--accent", "#efa64a"),
    fg: v("--fg", "#e7e3d9"),
    muted: v("--muted", "#9aa0ab"),
    dark: lum < 0.5,
  };
}

const KEY = "archboard3d.theme";

export function applySavedTheme(): void {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch { /* storage may be blocked; the OS preference still applies */ }
}

export function toggleTheme(): void {
  const next = readTheme().dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
}
