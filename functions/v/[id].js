// Short link: /v/<id> opens the viewer for a published board. Any ?mode, ?play, ?theme and ?controls carry over.
import { ID_RE } from "../../server/diagrams.js";

export async function onRequestGet({ request, params }) {
  const id = String(params.id || "");
  const url = new URL(request.url);
  if (!ID_RE.test(id)) return new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  // An absolute URL on this host; the projects hub rewrites it to /archboard-3d/view/ (the gate does the same).
  const target = new URL("/view/", url);
  target.searchParams.set("id", id);
  for (const key of ["mode", "play", "theme", "controls"]) if (url.searchParams.has(key)) target.searchParams.set(key, url.searchParams.get(key));
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
