import { startCdpServer } from "../studio/node_modules/inspect-webkit/dist/index.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
type Target = {
  targetId: string;
  source: { kind: string };
  title: string;
  url: string;
  bundleId?: string;
};
let bridge: Promise<{ getTargets(): Target[]; stop(): void }> | undefined;
const clients = new Map<
  string,
  { ws: WebSocket; events: string[]; bytes: number; seen: number }
>();
const port = 9237;
async function targets(udid: string) {
  const { stdout } = await exec("xcrun", [
    "simctl",
    "list",
    "devices",
    "booted",
    "-j",
  ]);
  const booted = Object.values(JSON.parse(stdout).devices).flat() as {
    udid: string;
    state: string;
  }[];
  if (
    booted.filter((d) => d.state === "Booted").length !== 1 ||
    !booted.some((d) => d.udid === udid && d.state === "Booted")
  )
    throw new Error(
      "인스펙터는 현재 연결한 시뮬레이터 한 대만 켠 상태에서 열어 주세요",
    );
  bridge ??= startCdpServer({ port, host: "127.0.0.1" }).catch((e: unknown) => {
    bridge = undefined;
    throw e;
  });
  const server = await bridge!;
  return server.getTargets().filter((t) => t.source.kind === "simulator");
}
export async function inspector(
  udid: string,
  operation: string,
  data: any = {},
) {
  for (const [id, c] of clients)
    if (Date.now() - c.seen > 30000) {
      c.ws.close();
      clients.delete(id);
    }
  if (operation === "targets") {
    return {
      targets: (await targets(udid)).map((t) => ({
        socket: "webkit",
        id: t.targetId,
        title: t.title,
        url: t.url,
        kind: t.bundleId === "com.apple.mobilesafari" ? "browser" : "webview",
      })),
      unavailable: 0,
    };
  }
  if (operation === "open") {
    if (!/^[a-f0-9-]{36}$/.test(data.connection))
      throw new Error("연결 ID 오류");
    if (!(await targets(udid)).some((t) => t.targetId === data.target))
      throw new Error("웹페이지를 다시 선택해 주세요");
    if (clients.size >= 4) throw new Error("열린 인스펙터를 먼저 닫아 주세요");
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/devtools/page/${data.target}`,
    );
    const client = { ws, events: [] as string[], bytes: 0, seen: Date.now() };
    ws.addEventListener("message", (e) => {
      if (typeof e.data !== "string") return;
      client.bytes += Buffer.byteLength(e.data);
      if (client.bytes > 8 * 1024 * 1024) {
        ws.close();
        return;
      }
      client.events.push(e.data);
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("인스펙터 연결 시간 초과"));
      }, 10000);
      ws.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      ws.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("인스펙터 연결 실패"));
        },
        { once: true },
      );
    });
    clients.set(data.connection, client);
    return {};
  }
  const client = clients.get(data.connection);
  if (!client) throw new Error("인스펙터 연결이 종료됐어요");
  client.seen = Date.now();
  if (operation === "close") {
    client.ws.close();
    clients.delete(data.connection);
    return {};
  }
  if (client.ws.readyState !== WebSocket.OPEN)
    throw new Error("인스펙터 연결이 종료됐어요");
  if (operation === "send") {
    if (
      !Array.isArray(data.messages) ||
      data.messages.length > 100 ||
      JSON.stringify(data.messages).length > 1024 * 1024
    )
      throw new Error("인스펙터 요청이 너무 커요");
    for (const raw of data.messages) {
      if (typeof raw !== "string") throw new Error("인스펙터 요청 오류");
      client.ws.send(raw);
    }
  }
  const events: string[] = [];
  let bytes = 0;
  while (client.events.length && bytes < 512 * 1024) {
    const raw = client.events.shift()!;
    events.push(raw);
    bytes += Buffer.byteLength(raw);
  }
  client.bytes -= bytes;
  return { events };
}

export function stopInspector() {
  for (const client of clients.values()) client.ws.close();
  clients.clear();
  void bridge?.then(server => server.stop()).catch(() => {});
  bridge = undefined;
}
