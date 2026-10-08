#!/usr/bin/env node
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
const { inventory, perform } = await import("./ios.ts");
const token = (await readFile(tokenFile, "utf8")).trim();
let responses: { id: string; result?: string; error?: string }[] = [];
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    stopping = true;
    appiumProcess?.kill();
  });
console.log(`Heimdall server ${id} → ${url.origin}`);
while (!stopping) {
  try {
    const batch = responses.splice(0, 1);
    const devices = await inventory();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ agentId: id, devices, responses: batch }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 413) batch.splice(0);
      if (!response.ok) throw new Error(`마스터 응답 ${response.status}`);
    } catch (error) {
      responses.unshift(...batch);
      throw error;
    }
    const { commands } = (await response.json()) as {
      commands: { id: string; path: string; body?: unknown }[];
    };
    for (const command of commands) {
      void perform(command.path, command.body)
        .then((result) =>
          responses.push({ id: command.id, result: result.toString("base64") }),
        )
        .catch(() =>
          responses.push({
            id: command.id,
            error: "시뮬레이터 조작을 완료하지 못했어요",
          }),
        );
    }
    await delay(300);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "마스터 연결 실패");
    await delay(2000);
  }
}
