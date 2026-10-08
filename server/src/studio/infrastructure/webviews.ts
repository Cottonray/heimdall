import * as device from "../../device.ts";
import type {
  WebViewDiscovery,
  WebViewTarget,
} from "../../../../contracts/studio.ts";
import { prepareRemoteDevice, RemoteDeviceError } from "./remote-device.ts";

const SOCKET =
  /^(?:webview_devtools_remote(?:_[A-Za-z0-9_.-]+)?|chrome_devtools_remote)$/;
const PAGE = /^\/devtools\/page\/[A-Za-z0-9._-]+$/;
const runtime = { adb: device.adb, prepare: prepareRemoteDevice, fetch };
type Runtime = typeof runtime;
type Target = WebViewTarget & { websocketPath: string; revision: string };

export function debuggingSockets(text: string): string[] {
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim().split(/\s+/).at(-1)?.replace(/^@/, "") || "")
        .filter((name) => SOCKET.test(name)),
    ),
  ].slice(0, 16);
}

export function parseTarget(socket: string, value: unknown): Target | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    row.type !== "page" ||
    typeof row.id !== "string" ||
    !/^[A-Za-z0-9._-]{1,200}$/.test(row.id)
  )
    return null;
  if (typeof row.webSocketDebuggerUrl !== "string") return null;
  let websocketPath: string;
  try {
    websocketPath = new URL(row.webSocketDebuggerUrl).pathname;
    if (
      !PAGE.test(websocketPath) ||
      websocketPath !== `/devtools/page/${row.id}`
    )
      return null;
  } catch {
    return null;
  }
  // Only the immutable revision is used. Never fetch a host supplied by a device.
  const revision =
    String(row.devtoolsFrontendUrl || "").match(
      /\/(?:serve_rev|serve_file|serve_internal_file)\/(@[a-f0-9]{40})\//,
    )?.[1] || "";
  return {
    socket,
    id: row.id,
    websocketPath,
    revision,
    title: typeof row.title === "string" ? row.title.slice(0, 1000) : "",
    url: typeof row.url === "string" ? row.url.slice(0, 8000) : "",
    kind: socket.startsWith("webview_") ? "webview" : "browser",
  };
}

async function forward(serial: string, socket: string, deps: Runtime) {
  if (!SOCKET.test(socket))
    throw new RemoteDeviceError(400, "웹뷰 ID를 확인해 주세요");
  const result = await deps.adb(
    ["-s", serial, "forward", "tcp:0", `localabstract:${socket}`],
    5000,
    true,
  );
  const port = Number(result.stdout.toString().trim());
  if (result.code !== 0 || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new RemoteDeviceError(502, "웹뷰 연결을 만들지 못했어요");
  let released = false;
  return {
    port,
    async release() {
      if (released) return;
      released = true;
      await deps
        .adb(["-s", serial, "forward", "--remove", `tcp:${port}`], 5000, true)
        .catch(() => undefined);
    },
  };
}

async function readTargets(port: number, socket: string, deps: Runtime) {
  const response = await deps.fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(4000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("WebView discovery failed");
  const body = await response.text();
  if (body.length > 1024 * 1024) throw new Error("WebView discovery too large");
  const rows: unknown = JSON.parse(body);
  if (!Array.isArray(rows)) throw new Error("Invalid WebView discovery");
  return rows
    .map((row) => parseTarget(socket, row))
    .filter((row): row is Target => row !== null);
}

async function sockets(serial: string, deps: Runtime) {
  await deps.prepare(serial);
  const result = await deps.adb(
    ["-s", serial, "shell", "cat", "/proc/net/unix"],
    5000,
    true,
  );
  if (result.code !== 0)
    throw new RemoteDeviceError(502, "웹뷰 목록을 확인하지 못했어요");
  return debuggingSockets(result.stdout.toString());
}

export async function discoverWebViews(
  serial: string,
  deps: Runtime = runtime,
): Promise<WebViewDiscovery> {
  const names = await sockets(serial, deps);
  const results = await Promise.allSettled(
    names.map(async (socket) => {
      const connection = await forward(serial, socket, deps);
      try {
        return (await readTargets(connection.port, socket, deps)).map(
          ({ websocketPath: _path, revision: _rev, ...target }) => target,
        );
      } finally {
        await connection.release();
      }
    }),
  );
  return {
    targets: results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
    unavailable: results.filter((result) => result.status === "rejected")
      .length,
  };
}

export async function openWebView(
  serial: string,
  socket: string,
  id: string,
  deps: Runtime = runtime,
) {
  if (!SOCKET.test(socket) || !/^[A-Za-z0-9._-]{1,200}$/.test(id))
    throw new RemoteDeviceError(400, "웹뷰 ID를 확인해 주세요");
  if (!(await sockets(serial, deps)).includes(socket))
    throw new RemoteDeviceError(
      404,
      "웹뷰가 닫혔어요. 목록을 새로고침해 주세요",
    );
  const connection = await forward(serial, socket, deps);
  try {
    const target = (await readTargets(connection.port, socket, deps)).find(
      (row) => row.id === id,
    );
    if (!target)
      throw new RemoteDeviceError(
        404,
        "웹페이지가 닫혔어요. 목록을 새로고침해 주세요",
      );
    return {
      ...connection,
      target,
      url: `ws://127.0.0.1:${connection.port}${target.websocketPath}`,
    };
  } catch (error) {
    await connection.release();
    throw error;
  }
}
