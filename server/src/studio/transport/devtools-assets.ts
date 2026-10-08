import type { ServerResponse } from "node:http";

export const DEVTOOLS_PREFIX = "/aiqa/api/studio/devtools/";
const ORIGIN = "https://chrome-devtools-frontend.appspot.com/";
const cache = new Map<string, { body: Buffer; type: string }>();
let cachedBytes = 0;

export function assetPath(route: string) {
  const path = route.slice("/api/studio/devtools/".length);
  if (
    !/^serve_rev\/@[a-f0-9]{40}\/[A-Za-z0-9_./-]+\.(?:html|js|css|svg|png|wasm|json)$/.test(
      path,
    ) ||
    path.split("/").some((part) => part === ".." || part === ".")
  )
    return null;
  return path;
}

/** Authenticated same-origin delivery keeps session cookies out of third-party frames. */
export async function serveDevTools(res: ServerResponse, route: string) {
  const path = assetPath(route);
  if (!path) {
    res.writeHead(404);
    res.end();
    return;
  }
  let asset = cache.get(path);
  if (!asset) {
    const response = await fetch(ORIGIN + path, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Chrome DevTools를 불러오지 못했어요");
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > 12 * 1024 * 1024)
      throw new Error("DevTools asset too large");
    asset = {
      body,
      type: response.headers.get("content-type") || "application/octet-stream",
    };
    if (cachedBytes + body.length > 48 * 1024 * 1024) {
      cache.clear();
      cachedBytes = 0;
    }
    cache.set(path, asset);
    cachedBytes += body.length;
  }
  res.writeHead(200, {
    "content-type": asset.type,
    "cache-control": "private, max-age=86400",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self' blob: data:; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://heimdall.example; frame-ancestors 'self'",
  });
  res.end(asset.body);
}
