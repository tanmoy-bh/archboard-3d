import { exampleDoc } from "../example";
import { parseDoc } from "../model/serialize";
import type { DocData } from "../model/types";
import { h } from "./dom";
import { openDialog } from "./dialog";

interface ExampleInfo { id: string; title: string; description: string }

/** The list of shipped examples. If it cannot be fetched (offline), the one built into the app is offered. */
async function readIndex(page: string): Promise<ExampleInfo[]> {
  try {
    const res = await fetch(new URL("diagrams/index.json", page));
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error("no index");
    const list = (await res.json()) as ExampleInfo[];
    if (Array.isArray(list) && list.length) return list;
  } catch { /* use the built in one */ }
  return [{ id: "", title: exampleDoc().title, description: "The ticketing example that is built into the app." }];
}

async function readExample(page: string, id: string): Promise<DocData> {
  if (!id) return exampleDoc();
  const res = await fetch(new URL(`diagrams/${id}.json`, page));
  if (!res.ok) throw new Error("That example could not be loaded.");
  return parseDoc(await res.text());
}

/** A menu of the examples that ship with the app. Picking one opens it on the board. */
export function openExamples(opts: { page: string; open: (doc: DocData) => void; fail: (message: string) => void }): void {
  const list = h("div", { class: "example-list" }, h("p", { class: "muted" }, "Loading the examples."));
  const dlg = openDialog("Examples", h("div", {}, h("p", { class: "muted" }, "Start from a finished board. It replaces what is on the board now; Undo brings that back."), list));
  readIndex(opts.page).then((items) => {
    list.replaceChildren(...items.map((e) => h("button", {
      class: "example-item", type: "button",
      onclick: async () => {
        try { const doc = await readExample(opts.page, e.id); dlg.close(); opts.open(doc); }
        catch (err) { opts.fail(err instanceof Error ? err.message : "Could not open that example."); }
      },
    }, h("strong", {}, e.title), h("span", {}, e.description))));
  });
}
