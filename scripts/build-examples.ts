/**
 * Writes the example boards that ship with the app to public/diagrams/. Run with:
 *   npx vite-node scripts/build-examples.ts
 * The files are committed; tests check that every one opens.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { exampleDoc } from "../src/example";
import { importDrawio } from "../src/import/drawio";
import { stringifyDoc } from "../src/model/serialize";
import { DocData, EdgeData, IconKey, ZoneData, emptyDoc } from "../src/model/types";

type N = [id: string, gx: number, gy: number, icon: IconKey, label: string];
type E = [from: string, to: string, opts?: Partial<EdgeData>];
type Z = [label: string, gx: number, gy: number, w: number, h: number, color: string];

function board(title: string, nodes: N[], edges: E[], zones: Z[], steps: string[]): DocData {
  const doc = emptyDoc();
  doc.title = title;
  doc.nodes = nodes.map(([id, gx, gy, icon, label]) => ({ id, gx, gy, icon, label }));
  doc.edges = edges.map(([from, to, o], i) => ({ id: `e${i + 1}`, from, to, ...o }));
  doc.zones = zones.map(([label, gx, gy, w, h, color], i): ZoneData => ({ id: `z${i + 1}`, label, gx, gy, w, h, color }));
  doc.steps = steps;
  return doc;
}

const serverless = board(
  "Serverless order pipeline",
  [
    ["user", 0, 2, "person", "Customer"],
    ["dns", 2, 0.5, "dns", "DNS"],
    ["waf", 2, 2, "firewall", "WAF"],
    ["cdn", 2, 3.5, "cdn", "CDN (static pages)"],
    ["gw", 4, 2, "gateway", "API gateway"],
    ["auth", 7.5, 0.5, "identity", "Identity (IAM)"],
    ["fn1", 5.5, 1, "lambda", "Order function"],
    ["fn2", 5.5, 3.5, "lambda", "Payment function"],
    ["db", 11, 0.5, "db", "Orders database"],
    ["q", 11, 2, "queue", "Order queue"],
    ["sns", 11, 3.5, "bell", "Notifications"],
    ["s3", 13, 0.5, "blob", "Invoices (object storage)"],
    ["kms", 13, 2, "key", "Secrets and keys"],
    ["dw", 13, 3.5, "warehouse", "Analytics warehouse"],
  ],
  [
    ["user", "waf", { label: "HTTPS", step: 1 }],
    ["waf", "gw", { label: "clean traffic", step: 1 }],
    ["cdn", "user", { label: "static pages", dash: true }],
    ["gw", "auth", { label: "verify token", step: 2 }],
    ["gw", "fn1", { label: "POST /orders", step: 2 }],
    ["fn1", "db", { label: "save order", step: 3, hot: true }],
    ["fn1", "q", { label: "order placed", step: 4 }],
    ["q", "fn2", { label: "consume", dash: true, step: 4 }],
    ["fn2", "kms", { label: "payment key" }],
    ["fn2", "sns", { label: "notify", step: 5 }],
    ["fn2", "s3", { label: "invoice PDF", step: 5 }],
    ["db", "dw", { label: "nightly export", dash: true }],
    ["dns", "waf", { label: "resolve" }],
  ],
  [
    ["Edge", 1, -0.5, 3, 5.5, "#e0a526"],
    ["Compute", 4, -0.5, 4.5, 5.5, "#4f8cff"],
    ["Data", 9.5, -0.5, 4.5, 5.5, "#3fb67a"],
  ],
  [
    "Traffic enters through DNS, the firewall and the API gateway. The gateway sits on the border of the edge and compute zones.",
    "The gateway checks the caller's identity, then hands the request to the order function.",
    "The order function saves the order (the key path).",
    "It puts a message on the queue. The payment function picks it up when it can.",
    "The payment function notifies the customer and writes the invoice.",
  ],
);

const rag = board(
  "RAG assistant",
  [
    ["docs", 1, 0.5, "doc", "Documents and wiki"],
    ["etl", 3, 0.5, "etl", "Chunk and embed job"],
    ["emb", 5, 0.5, "embed", "Embedding model"],
    ["vec", 7, 0.5, "vector", "Vector database"],
    ["user", 1, 4, "person", "User"],
    ["api", 3, 4, "svc", "Chat API"],
    ["guard", 5, 3, "guard", "Guardrails"],
    ["ret", 5, 5, "retriever", "Retriever and reranker"],
    ["mem", 3, 5.5, "memory", "Conversation memory"],
    ["prompt", 7.5, 4, "prompt", "Prompt template"],
    ["llm", 9.5, 4, "llm", "LLM"],
    ["tools", 9.5, 5.5, "tools", "Tool calls"],
  ],
  [
    ["docs", "etl", { label: "new files" }],
    ["etl", "emb", { label: "text chunks" }],
    ["emb", "vec", { label: "vectors" }],
    ["user", "api", { label: "question", step: 1 }],
    ["api", "guard", { label: "check input", step: 2 }],
    ["guard", "ret", { label: "safe query", step: 3 }],
    ["ret", "vec", { label: "top-k search", step: 3, hot: true }],
    ["vec", "ret", { label: "matches", dash: true, step: 3 }],
    ["ret", "prompt", { label: "context", step: 4 }],
    ["mem", "prompt", { label: "history", step: 4 }],
    ["prompt", "llm", { label: "full prompt", step: 5, hot: true }],
    ["llm", "tools", { label: "function call", both: true }],
    ["llm", "api", { label: "answer", dash: true, step: 6 }],
  ],
  [
    ["Ingestion", 0, -0.5, 8.5, 2.5, "#9b7cf0"],
    ["Answering", 0, 2.5, 11, 4, "#2bb5a8"],
  ],
  [
    "The user asks a question through the chat API.",
    "Guardrails check the question.",
    "The retriever searches the vector database, built earlier by the ingestion job, and reranks the matches.",
    "The prompt template joins the matches with the conversation history.",
    "The LLM answers, calling tools if it needs them.",
    "The answer goes back to the user.",
  ],
);

const layers = (await importDrawio(readFileSync("samples/layers-example.drawio", "utf8"))).doc;
layers.title = "Layers: edge, BFF and middleware";
const ticketing = exampleDoc();

const files: [id: string, title: string, description: string, doc: DocData][] = [
  ["ticketing", ticketing.title, "Ticket holds: a waiting room, a seat map, a booking service with timed holds and a payment provider.", ticketing],
  ["layers", layers.title, "Imported from draw.io: edge, BFF and middleware layers drawn as zones, with cloud icons mapped to components.", layers],
  ["cloud-serverless", serverless.title, "Cloud components and three zones. The API gateway sits on a zone border.", serverless],
  ["ai-rag", rag.title, "An AI assistant that looks up documents before answering: ingestion on top, answering below.", rag],
];

for (const [id, , , doc] of files) writeFileSync(`public/diagrams/${id}.json`, stringifyDoc(doc) + "\n");
writeFileSync("public/diagrams/index.json", JSON.stringify(files.map(([id, title, description]) => ({ id, title, description })), null, 2) + "\n");
console.log(`wrote ${files.length} examples`);
