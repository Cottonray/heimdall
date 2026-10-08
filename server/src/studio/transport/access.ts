import type { IncomingMessage } from "node:http";
export function allowed(req: IncomingMessage) {
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    req.socket.remoteAddress || "",
  );
  const host = req.headers.host?.split(":")[0];
  if (!local && host !== "gateway.example") return false;
  return (
    !req.headers.origin || req.headers.origin === "https://gateway.example"
  );
}
