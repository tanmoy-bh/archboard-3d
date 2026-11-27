/**
 * The long written explanation of a board. It is plain text with a little markup, so it stays easy to type:
 * "## " starts a section, "### " a smaller heading, "- " a bullet, and **words** are bold.
 * No DOM in here so it can be unit tested.
 */
export type NoteBlock =
  | { kind: "h2" | "h3" | "p"; text: string }
  | { kind: "ul"; items: string[] };

export function parseNotes(source: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let para: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    if (items.length) blocks.push({ kind: "ul", items });
    para = [];
    items = [];
  };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^(##|###)\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (head) { flush(); blocks.push({ kind: head[1] === "##" ? "h2" : "h3", text: head[2] }); }
    else if (line.startsWith("- ")) { if (para.length) flush(); items.push(line.slice(2).trim()); }
    else { if (items.length) flush(); para.push(line); }
  }
  flush();
  return blocks;
}

/** Cut a line into plain and **bold** runs. A lone ** is left as it is. */
export function boldRuns(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));
}
