/** Pixels for one "line" or "page" step, for mice that report the wheel that way. */
const LINE_PX = 16;
const PAGE_PX = 400;

/**
 * How far, in pixels, a wheel event should move the board sideways. Zero means it is not a side scroll
 * and the caller should treat it as usual. Side scrolls are a tilt or thumb wheel, a sideways swipe, or
 * Shift with the ordinary wheel. A pinch, or Ctrl or Cmd with the wheel, always stays a zoom.
 */
export function sidewaysScroll(e: WheelEvent): number {
  if (e.ctrlKey || e.metaKey) return 0;
  const x = e.deltaX || (e.shiftKey ? e.deltaY : 0);
  if (!x) return 0;
  if (!e.shiftKey && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return 0;
  return x * (e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1);
}
