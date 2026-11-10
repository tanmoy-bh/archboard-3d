import type { IconKey } from "../model/types";

/** Human names, used in the palette, the legend and the type selector. */
export const ICON_NAMES: Record<IconKey, string> = {
  svc: "Service", redis: "Redis / cache", db: "Database", es: "Search index", vector: "Vector DB",
  queue: "Queue / stream", cdn: "CDN", phone: "Mobile client", laptop: "Web client", person: "Person",
  gateway: "LB / gateway", blob: "Object storage", card: "Payment provider", bell: "Notifications",
  mail: "Email", sms: "SMS", ai: "AI model / agent", doc: "Documents / logs", graph: "Graph",
  lock: "Lock / lease", chart: "Dashboard", ring: "Hash ring", filter: "Filter", server: "Servers",
  apps: "SaaS apps", box: "Sandbox", globe: "External site", decision: "Decision / condition",
  startend: "Start / end", process: "Process / step", loop: "Loop / retry", fork: "Fork / join",
  timer: "Timer / schedule", trigger: "Event / trigger",
  http: "HTTP", rest: "REST API", websocket: "WebSocket", sse: "Server-sent events", webhook: "Webhook",
};

/** Palette grouping. Every icon appears exactly once. */
export const PALETTE_GROUPS: { title: string; icons: IconKey[] }[] = [
  { title: "Clients", icons: ["phone", "laptop", "person", "globe", "apps"] },
  { title: "Edge", icons: ["cdn", "gateway", "filter", "lock"] },
  { title: "Compute", icons: ["svc", "server", "box", "ai"] },
  { title: "Data", icons: ["db", "redis", "es", "vector", "blob", "graph", "ring", "doc"] },
  { title: "Messaging", icons: ["queue", "bell", "mail", "sms"] },
  { title: "Logic", icons: ["decision", "startend", "process", "loop", "fork", "timer", "trigger"] },
  { title: "Networking", icons: ["http", "rest", "websocket", "sse", "webhook"] },
  { title: "Other", icons: ["card", "chart"] },
];
