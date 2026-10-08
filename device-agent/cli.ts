#!/usr/bin/env node
import { openSshRelay } from "./ssh-relay.ts";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
function option(name: string) {
  const i = process.argv.indexOf(name);
  return i < 0 ? "" : process.argv[i + 1] || "";
}
if (process.argv.includes("--help")) {
  console.log(
    "heimdall server --master https://master [--config /path/config.json]\nRequires Node 22+, Xcode, and Appium XCUITest at 127.0.0.1:4725. No inbound ports or SSH required.",
  );
  process.exit(0);
}
if (process.argv[2] !== "server")
  throw new Error(
    "heimdall server --master <마스터주소> 형식으로 실행해 주세요",
  );
const config = JSON.parse(
  await readFile(
    option("--config") || join(homedir(), ".config/heimdall/agent.json"),
    "utf8",
  ),
);
const master = option("--master") || config.master,
  id = config.id,
  tokenFile = config.tokenFile,
  device = config.device;
if (!master || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !tokenFile || !device)
  throw new Error("--help를 확인해 주세요");
const url = new URL("/aiqa/api/studio/agents/poll", master);
if (!["http:", "https:"].includes(url.protocol))
  throw new Error("HTTP(S) 주소를 사용해 주세요");
process.env.HEIMDALL_IOS_UDID = device;
let appiumProcess: ReturnType<typeof spawn> | undefined;
try {
  await fetch("http://127.0.0.1:4725/status", {
    signal: AbortSignal.timeout(2000),
  });
} catch {
  appiumProcess = spawn(
    "appium",
    ["--address", "127.0.0.1", "--port", "4725", "--log-level", "warn"],
    { stdio: "inherit" },
  );
  appiumProcess.on("error", () => {
    console.error("Appium과 XCUITest 드라이버를 먼저 설치해 주세요");
    process.exit(1);
  });
  await delay(2000);
}
const { inventory, perform, stop } = await import("./ios.ts");
const token = (await readFile(tokenFile, "utf8")).trim();
let stopping = false;
let connection: WebSocket | undefined;
const shutdown = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    shutdown.abort();
    connection?.close();
    await stop();
    appiumProcess?.kill();
  });
type Command = { id: string; path: string; body?: unknown };

let devices = await inventory();
const endpoint = new URL("/aiqa/studio/ws?agent=1", master);
endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
console.log(`Heimdall server ${id} → ${url.origin}`);
async function connected(endpoint: URL) {
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(endpoint);
    connection = ws;
    let ready = false;
    let updating = false;
    let receivedAt = Date.now();
    let streamingSerial = "";
    let streamUntil = 0;
    let streaming = false;
    let lastFrame: Buffer | undefined;
    const frames = setInterval(() => {
      if (
        streaming ||
        !streamingSerial ||
        Date.now() > streamUntil ||
        ws.readyState !== WebSocket.OPEN ||
        ws.bufferedAmount > 128 * 1024
      )
        return;
      streaming = true;
      const serial = streamingSerial;
      void perform(`/frame?serial=${encodeURIComponent(serial)}`)
        .then((jpeg) => {
          if (
            finished ||
            serial !== streamingSerial ||
            ws.readyState !== WebSocket.OPEN ||
            ws.bufferedAmount > 128 * 1024 ||
            lastFrame === jpeg
          )
            return;
          lastFrame = jpeg;
          ws.send(
            JSON.stringify({
              frame: { serial, jpeg: jpeg.toString("base64") },
            }),
          );
        })
        .catch(() => finish())
        .finally(() => {
          streaming = false;
        });
    }, 16);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearInterval(heartbeat);
      clearInterval(frames);
      // Do not wait forever for a close handshake through a stale SSH forward.
      ws.close();
      resolve();
    };
    const timeout = setTimeout(finish, 10000);
    const heartbeat = setInterval(() => {
      if (Date.now() - receivedAt > 12000) {
        finish();
        return;
      }
      if (!ready || updating || ws.readyState !== WebSocket.OPEN) return;
      updating = true;
      void inventory()
        .then((value) => {
          devices = value;
        })
        .catch(() => {
          devices = devices.map((d) => ({ ...d, ready: false }));
        })
        .finally(() => {
          updating = false;
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ devices }));
        });
    }, 4000);
    ws.addEventListener("open", () =>
      ws.send(
        JSON.stringify({ agentId: id, token, devices, frameStreaming: true }),
      ),
    );
    ws.addEventListener("close", () => {
      finish();
    });
    // Undici emits close after error; calling close from error recurses while connecting.
    ws.addEventListener("error", () => {});
    ws.addEventListener("message", (event) => {
      if (finished) return;
      receivedAt = Date.now();
      try {
        const data = JSON.parse(String(event.data));
        if (data.ready) {
          ready = true;
          clearTimeout(timeout);
          console.log("마스터 연결 완료");
        }
        if (!Array.isArray(data.commands)) return;
        if (data.commands.length > 32) {
          ws.close();
          return;
        }
        for (const command of data.commands as Command[]) void execute(command);
      } catch {
        ws.close();
      }
    });
    async function execute(command: Command) {
      let response: { id: string; result?: string; error?: string };
      try {
        const path = new URL(command.path, "http://localhost");
        if (
          path.pathname === "/frames/start" ||
          path.pathname === "/frames/stop"
        ) {
          const serial = path.searchParams.get("serial");
          if (!devices.some((d) => d.serial === serial && d.ready))
            throw new Error("Unknown device");
          streamingSerial = path.pathname === "/frames/start" ? serial! : "";
          streamUntil = Date.now() + 12000;
          if (!streamingSerial) lastFrame = undefined;
        }
        response = {
          id: command.id,
          result: (path.pathname.startsWith("/frames/")
            ? Buffer.from("{}")
            : await perform(command.path, command.body)
          ).toString("base64"),
        };
      } catch {
        response = {
          id: command.id,
          error: "시뮬레이터 요청을 완료하지 못했어요",
        };
      }
      if (ws.readyState !== WebSocket.OPEN) return;
      // At most one frame is requested at a time. Never accumulate large image responses.
      if (ws.bufferedAmount > 1000000) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ responses: [response] }));
    }
  });
}
while (!stopping) {
  try {
    if (config.relaySsh) {
      const relay = await openSshRelay(config.relaySsh, shutdown.signal);
      try {
        await connected(relay.url);
      } finally {
        relay.close();
      }
    } else await connected(endpoint);
  } catch {
    console.error("마스터 연결을 확인해 주세요");
  }
  if (!stopping)
    await delay(1000, undefined, { signal: shutdown.signal }).catch(() => {});
}
