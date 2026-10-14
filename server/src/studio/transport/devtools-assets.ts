import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { DIR } from "../infrastructure/config.ts";
import type { ServerResponse } from "node:http";

export const DEVTOOLS_PREFIX = "/aiqa/api/studio/devtools/";
const ORIGIN = "https://chrome-devtools-frontend.appspot.com/";
const cache = new Map<
  string,
  { body: Buffer; type: string; compressed: Buffer }
>();
let cachedBytes = 0;

export function assetPath(route: string) {
  const path = route.slice("/api/studio/devtools/".length);
  if (
    !/^serve_rev\/@[a-f0-9]{40}\/[A-Za-z0-9_./-]+\.(?:html|js|css|svg|png|wasm|json|woff2)$/.test(
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
    const disk = join(DIR, "devtools-cache", path);
    let body: Buffer;
    let type: string;
    try {
      body = await readFile(disk);
      type = path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".html")
            ? "text/html"
            : path.endsWith(".svg")
              ? "image/svg+xml"
              : path.endsWith(".json")
                ? "application/json"
                : path.endsWith(".wasm")
                  ? "application/wasm"
                  : path.endsWith(".png")
                    ? "image/png"
                    : path.endsWith(".woff2")
                      ? "font/woff2"
                      : "application/octet-stream";
    } catch {
      const response = await fetch(ORIGIN + path, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Chrome DevTools를 불러오지 못했어요");
      body = Buffer.from(await response.arrayBuffer());
      if (body.length > 12 * 1024 * 1024)
        throw new Error("DevTools asset too large");
      type = response.headers.get("content-type") || "application/octet-stream";
      await mkdir(dirname(disk), { recursive: true });
      await writeFile(disk, body);
    }
    asset = { body, type, compressed: gzipSync(body) };
    if (cachedBytes + body.length > 48 * 1024 * 1024) {
      cache.clear();
      cachedBytes = 0;
    }
    cache.set(path, asset);
    cachedBytes += body.length;
  }
  res.writeHead(200, {
    "content-type": asset.type,
    "content-encoding": "gzip",
    "cache-control": "private, max-age=86400",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self' blob: data:; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'",
  });
  res.end(asset.compressed);
}
