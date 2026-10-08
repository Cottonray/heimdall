import type { IncomingMessage } from "node:http";
const hosts = new Set(["gateway.example", "heimdall.example"]);
function isLocal(req: IncomingMessage) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    req.socket.remoteAddress || "",
  );
}
export function allowedBrowserOrigin(req: IncomingMessage) {
  const host = req.headers.host?.split(":")[0]?.toLowerCase() || "";
  const origin = req.headers.origin;
  if (isLocal(req))
    return [...hosts].some((allowed) => origin === "https://" + allowed);
  return hosts.has(host) && origin === "https://" + host;
}
export function allowed(req: IncomingMessage) {
  const host = req.headers.host?.split(":")[0]?.toLowerCase() || "";
  if (!isLocal(req) && !hosts.has(host)) return false;
  return !req.headers.origin || allowedBrowserOrigin(req);
}
