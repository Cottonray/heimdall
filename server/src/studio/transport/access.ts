import type { IncomingMessage } from "node:http";
const allowedHosts = () => new Set(
  (process.env.HEIMDALL_ALLOWED_HOSTS || "localhost,127.0.0.1")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);
function isLocal(req: IncomingMessage) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    req.socket.remoteAddress || "",
  );
}
export function allowedBrowserOrigin(req: IncomingMessage) {
  const hosts = allowedHosts();
  const host = req.headers.host?.split(":")[0]?.toLowerCase() || "";
  const origin = req.headers.origin;
  if (isLocal(req))
    return [...hosts].some((allowed) => origin === "https://" + allowed);
  return hosts.has(host) && origin === "https://" + host;
}
export function allowed(req: IncomingMessage) {
  const hosts = allowedHosts();
  const host = req.headers.host?.split(":")[0]?.toLowerCase() || "";
  if (!isLocal(req) && !hosts.has(host)) return false;
  return !req.headers.origin || allowedBrowserOrigin(req);
}
