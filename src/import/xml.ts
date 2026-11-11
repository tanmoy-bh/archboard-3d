/**
 * A small XML reader for draw.io files: elements, attributes, text, entities, comments, CDATA, processing
 * instructions. It does not use DOMParser so it runs the same in the browser and under test.
 */
export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Text directly inside the element, entities decoded. */
  text: string;
}

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

/** Decode &lt; &gt; &amp; &quot; &apos; &nbsp; and numeric references. Unknown references are left as they are. */
export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const MAX_DEPTH = 200;

export function parseXml(src: string): XmlNode {
  let i = 0;
  const n = src.length;
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  const fail = (msg: string): never => { throw new Error(`This file is not valid XML (${msg}).`); };

  while (i < n) {
    const lt = src.indexOf("<", i);
    const text = src.slice(i, lt === -1 ? n : lt);
    if (stack.length && text.trim()) stack[stack.length - 1].text += decodeEntities(text);
    if (lt === -1) break;
    i = lt;

    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      if (end === -1) fail("unterminated comment");
      i = end + 3;
    } else if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i + 9);
      if (end === -1) fail("unterminated CDATA");
      if (stack.length) stack[stack.length - 1].text += src.slice(i + 9, end);
      i = end + 3;
    } else if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i + 2);
      if (end === -1) fail("unterminated declaration");
      i = end + 2;
    } else if (src.startsWith("<!", i)) {
      const end = src.indexOf(">", i + 2);
      if (end === -1) fail("unterminated declaration");
      i = end + 1;
    } else if (src.startsWith("</", i)) {
      const end = src.indexOf(">", i + 2);
      if (end === -1) fail("unterminated closing tag");
      const name = src.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.tag !== name) fail(`unexpected </${name}>`);
      i = end + 1;
    } else {
      // opening tag: name, attributes (quoted values may contain > and <), then > or />
      let j = i + 1;
      while (j < n && !/[\s/>]/.test(src[j])) j++;
      const node: XmlNode = { tag: src.slice(i + 1, j), attrs: {}, children: [], text: "" };
      if (!node.tag) fail("empty tag name");
      let selfClose = false;
      for (;;) {
        while (j < n && /\s/.test(src[j])) j++;
        if (j >= n) fail("unterminated tag");
        if (src[j] === ">") { j++; break; }
        if (src[j] === "/" && src[j + 1] === ">") { selfClose = true; j += 2; break; }
        const ns = j;
        while (j < n && !/[\s=/>]/.test(src[j])) j++;
        const name = src.slice(ns, j);
        if (!name) fail("bad attribute");
        while (j < n && /\s/.test(src[j])) j++;
        let value = "";
        if (src[j] === "=") {
          j++;
          while (j < n && /\s/.test(src[j])) j++;
          const q = src[j];
          if (q === '"' || q === "'") {
            const end = src.indexOf(q, j + 1);
            if (end === -1) fail("unterminated attribute value");
            value = src.slice(j + 1, end);
            j = end + 1;
          } else {
            const vs = j;
            while (j < n && !/[\s/>]/.test(src[j])) j++;
            value = src.slice(vs, j);
          }
        }
        node.attrs[name] = decodeEntities(value);
      }
      if (stack.length) stack[stack.length - 1].children.push(node);
      else if (!root) root = node;
      else fail("more than one root element");
      if (!selfClose) {
        stack.push(node);
        if (stack.length > MAX_DEPTH) fail("nested too deeply");
      }
      i = j;
    }
  }
  if (stack.length) fail(`<${stack[stack.length - 1].tag}> is not closed`);
  if (!root) fail("no elements found");
  return root as XmlNode;
}

/** Depth first search for descendants with a tag name. */
export function findAll(node: XmlNode, tag: string, out: XmlNode[] = []): XmlNode[] {
  for (const c of node.children) {
    if (c.tag === tag) out.push(c);
    findAll(c, tag, out);
  }
  return out;
}
