import { randomUUID } from "node:crypto";
import { isIos, iosRequest } from "../infrastructure/ios-bridge.ts";
import type { WsConnection } from "../../ws.ts";
import { openWebView } from "../infrastructure/webviews.ts";

/** Transparent CDP transport: the UI is Chromium's own DevTools frontend. */
export async function connectInspector(
  ws: WsConnection,
  serial: string,
  socket: string,
  id: string,
  authorized: () => Promise<boolean>,
) {
  if (isIos(serial)) return connectIosInspector(ws, serial, id, authorized);
  let closed = false;
  let upstream: WebSocket | undefined;
  let release: (() => Promise<void>) | undefined;
  let queued: string[] = [];
  let bytes = 0;
  let checking = false;
  let permitted = true;
  let messages = Promise.resolve();
  let authorization: Promise<boolean> | undefined;
  const check = () =>
    (authorization ??= authorized().finally(() => {
      authorization = undefined;
    }));
  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    queued = [];
    upstream?.close();
    void release?.();
  };
  const timer = setInterval(() => {
    if (closed || checking) return;
    if (Date.now() - ws.lastReceivedAt > 15000) {
      ws.close(1001);
      return;
    }
    ws.ping();
    checking = true;
    void authorized()
      .then((ok) => {
        permitted = ok;
        if (!ok) ws.close(4409);
      })
      .catch(() => ws.close(4401))
      .finally(() => {
        checking = false;
      });
  }, 5000);
  timer.unref();
  ws.on({
    onClose: stop,
    onMessage(raw) {
      if (!permitted || closed) return;
      bytes += Buffer.byteLength(raw);
      if (bytes > 1024 * 1024) {
        ws.close(1009);
        return;
      }
      const permission = check();
      messages = messages
        .then(async () => {
          if (closed) return;
          if (!(await permission)) {
            ws.close(4409);
            return;
          }
          if (closed) return;
          if (upstream?.readyState === WebSocket.OPEN) {
            if (upstream.bufferedAmount > 4 * 1024 * 1024) {
              ws.close(1009);
              return;
            }
            upstream.send(raw);
            bytes -= Buffer.byteLength(raw);
          } else queued.push(raw);
        })
        .catch(() => ws.close(4401));
    },
  });
  try {
    if (!(await authorized())) {
      ws.close(4409);
      return;
    }
    const connection = await openWebView(serial, socket, id);
    release = connection.release;
    if (closed) {
      await release();
      return;
    }
    if (!(await authorized())) {
      ws.close(4409);
      return;
    }
    upstream = new WebSocket(connection.url);
    const timeout = setTimeout(() => ws.close(4503), 10000);
    upstream.addEventListener("open", () => {
      clearTimeout(timeout);
      if (closed) {
        upstream?.close();
        return;
      }
      for (const message of queued) upstream!.send(message);
      bytes -= queued.reduce(
        (size, message) => size + Buffer.byteLength(message),
        0,
      );
      queued = [];
    });
    upstream.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (closed) return;
      if (ws.backlog > 8 * 1024 * 1024) {
        ws.close(1009);
        return;
      }
      if (typeof event.data === "string") ws.send(event.data);
    });
    upstream.addEventListener("close", () => {
      clearTimeout(timeout);
      ws.close(1001);
    });
    upstream.addEventListener("error", () => {
      clearTimeout(timeout);
      ws.close(4503);
    });
  } catch {
    ws.close(4503);
  }
}

async function connectIosInspector(
  ws: WsConnection,
  serial: string,
  target: string,
  authorized: () => Promise<boolean>,
) {
  const connection = randomUUID();
  let closed = false,
    ready = false;
  const queue: string[] = [];
  let lastPing = 0;
  let bytes = 0;
  const call = async (op: string, args = {}) =>
    JSON.parse(
      (
        await iosRequest(
          "/inspector/" + op + "?serial=" + encodeURIComponent(serial),
          { connection, ...args },
        )
      ).toString(),
    );
  ws.on({
    onClose() {
      closed = true;
      if (ready) void call("close").catch(() => {});
    },
    onMessage(raw) {
      bytes += Buffer.byteLength(raw);
      if (bytes > 1024 * 1024) ws.close(1009);
      else queue.push(raw);
    },
  });
  try {
    if (!(await authorized())) {
      ws.close(4409);
      return;
    }
    await call("open", { target });
    ready = true;
    while (!closed) {
      if (!(await authorized())) {
        ws.close(4409);
        break;
      }
      if (Date.now() - ws.lastReceivedAt > 15000) { ws.close(1001); break; }
      if (Date.now() - lastPing > 5000) { ws.ping(); lastPing = Date.now(); }
      const messages = queue.splice(0, 100);
      bytes -= messages.reduce((n, s) => n + Buffer.byteLength(s), 0);
      const result = await call(messages.length ? "send" : "poll", {
        messages,
      });
      if (!(await authorized())) {
        ws.close(4409);
        break;
      }
      for (const event of result.events || []) {
        if (ws.backlog > 8 * 1024 * 1024) {
          ws.close(1009);
          break;
        }
        ws.send(event);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch {
    ws.close(4503);
  } finally {
    closed = true;
    if (ready) await call("close").catch(() => {});
  }
}
