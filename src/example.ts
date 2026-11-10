import type { DocData, EdgeData, IconKey, NodeData } from "./model/types";

type N = [id: string, gx: number, gy: number, icon: IconKey, label: string];
type E = [from: string, to: string, opts?: Partial<EdgeData>];

const nodes: N[] = [
  ["cdn", 0, 0, "cdn", "CDN"],
  ["cl", 0, 1.5, "phone", "Client"],
  ["gw", 1, 1.5, "gateway", "LB / Gateway"],
  ["wr", 2, 0, "svc", "Waiting Room Service"],
  ["k", 4, 0, "queue", "Queue (Kafka)"],
  ["tk", 6, 0, "redis", "Redis (Token Status)"],
  ["se", 2, 1.5, "svc", "Search Service"],
  ["sc", 3, 1.5, "redis", "Seating Cache (Redis Bitfield)"],
  ["es", 4, 1.5, "es", "Elasticsearch"],
  ["bk", 2, 3, "svc", "Booking Service"],
  ["sql", 4, 3, "db", "SQL Database"],
  ["ar", 3, 4, "redis", "Active Reservations (Redis)"],
  ["dq", 4.5, 4.5, "queue", "Delay Queue (Redis)"],
  ["pay", 1, 3, "svc", "Payment Service"],
  ["pp", 0, 3, "card", "Payment Provider"],
];

const edges: E[] = [
  ["cl", "cdn", { label: "static pages" }],
  ["cl", "gw", { step: 1 }],
  ["gw", "wr", { label: "join queue", step: 1 }],
  ["wr", "k", { label: "enqueue user" }],
  ["k", "wr", { label: "admit N users / sec", dash: true }],
  ["wr", "tk", { label: "token status (allowed in?)" }],
  ["gw", "se", { label: "browse" }],
  ["se", "sc", { label: "seat map", step: 2 }],
  ["se", "es", { label: "search events" }],
  ["gw", "bk"],
  ["bk", "ar", { label: "hold seat (10 min TTL)", step: 2, hot: true }],
  ["bk", "dq", { label: "expire hold later", step: 5, dash: true }],
  ["bk", "sql", { label: "mark SOLD (if held by me)", step: 4, hot: true }],
  ["sql", "es", { label: "CDC sync" }],
  ["gw", "pay", { label: "pay" }],
  ["pay", "pp", { label: "charge", step: 3 }],
  ["pay", "bk", { label: "payment OK", step: 4 }],
];

/** A worked example (ticket holds), so a fresh board is never empty. */
export function exampleDoc(): DocData {
  return {
    version: 1,
    title: "Ticketing: held seats",
    nodes: nodes.map(([id, gx, gy, icon, label]): NodeData => ({ id, gx, gy, icon, label })),
    edges: edges.map(([from, to, o], i): EdgeData => ({ id: `e${i + 1}`, from, to, ...o })),
    texts: [],
    steps: [
      "The waiting room admits users in batches (Kafka plus token status in Redis).",
      "Browse the seat map, then hold a seat with a 10 minute time to live.",
      "Pay through the payment provider.",
      "Mark the seat SOLD in SQL with a conditional update.",
      "A delay queue releases holds that were never paid.",
    ],
  };
}
