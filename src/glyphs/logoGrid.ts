export interface LogoCell {
  /** Centre of the cell in a box that runs from -0.5 to 0.5 both ways. y grows downwards, like a page. */
  x: number;
  y: number;
  /** Width and height of the square cell. */
  size: number;
}

/** Where each logo goes when one box shows several: one, two side by side, a 2 x 2 block, or rows of three. */
export function logoCells(count: number): LogoCell[] {
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const size = 1 / cols;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, count - row * cols); // a short last row is centred
    return { x: ((i % cols) - (inRow - 1) / 2) * size, y: (row - (rows - 1) / 2) * size, size };
  });
}
