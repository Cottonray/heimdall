import { remoteAction } from "../server/src/studio/domain/remote-device.ts";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
const udid = process.env.HEIMDALL_IOS_UDID;
if (!udid || !/^[A-Fa-f0-9-]{36}$/.test(udid))
  throw new Error("--device UUID가 필요해요");
const serial = `ios:${udid}`;
const appium = "http://127.0.0.1:4725";
let session = process.env.HEIMDALL_IOS_SESSION || "";
let starting: Promise<void> | undefined;
async function request(path: string, body?: unknown) {
  const res = await fetch(appium + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const json = (await res.json()) as { value: any };
  if (!res.ok || json.value?.error) {
    if (json.value?.error === "invalid session id") session = "";
    throw new Error(json.value?.message || "iOS 연결 오류");
  }
  return json.value;
}
async function prepare() {
  if (!session) {
    starting ??= (async () => {
      const value = await request("/session", {
        capabilities: {
          alwaysMatch: {
            platformName: "iOS",
            "appium:automationName": "XCUITest",
            "appium:udid": udid,
            "appium:derivedDataPath":
              process.env.HEIMDALL_WDA_BUILD || "/tmp/heimdall-wda",
            "appium:noReset": true,
            "appium:newCommandTimeout": 0,
            "appium:wdaLocalPort": 8115,
            "appium:mjpegServerPort": 9115,
          },
        },
      });
      session = value.sessionId;
    })().finally(() => {
      starting = undefined;
    });
    await starting;
  }
  return request(`/session/${session}/window/rect`);
}
async function execute(script: string, args: object) {
  return request(`/session/${session}/execute/sync`, { script, args: [args] });
}
export async function inventory() {
  const { stdout } = await exec(
    "xcrun",
    ["simctl", "list", "devices", "available", "--json"],
    { timeout: 5000 },
  );
  const devices = Object.values(JSON.parse(stdout).devices).flat() as {
    udid: string;
    name: string;
    state: string;
  }[];
  const item = devices.find((item) => item.udid === udid);
  return item
    ? [
        {
          serial,
          model: item.name,
          platform: "ios",
          kind: "emulator",
          state: item.state === "Booted" ? "device" : "offline",
          ready: item.state === "Booted",
          current: true,
          selectable: true,
        },
      ]
    : [];
}
export async function perform(path: string, body?: unknown): Promise<Buffer> {
  const url = new URL(path, "http://localhost");
  if (url.searchParams.get("serial") !== serial)
    throw new Error("허용되지 않은 기기예요");
  const size = await prepare();
  if (url.pathname === "/prepare")
    return Buffer.from(
      JSON.stringify({ width: size.width, height: size.height }),
    );
  if (url.pathname === "/frame") {
    const directory = await mkdtemp(join(tmpdir(), "heimdall-frame-"));
    try {
      const input = join(directory, "frame.png"),
        output = join(directory, "frame.jpg");
      await writeFile(
        input,
        Buffer.from(await request(`/session/${session}/screenshot`), "base64"),
      );
      await exec(
        "sips",
        [
          "-Z",
          "1200",
          "-s",
          "format",
          "jpeg",
          "-s",
          "formatOptions",
          "65",
          input,
          "--out",
          output,
        ],
        { timeout: 5000 },
      );
      const frame = await readFile(output);
      if (frame.length > 500000) throw new Error("화면 크기를 줄여 주세요");
      return frame;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  if (url.pathname !== "/action") throw new Error("지원하지 않는 요청이에요");
  const action = remoteAction(body, size);
  if (action.type === "tap")
    await execute("mobile: tap", { x: action.x, y: action.y });
  else if (action.type === "swipe")
    await execute("mobile: dragFromToForDuration", {
      fromX: action.x1,
      fromY: action.y1,
      toX: action.x2,
      toY: action.y2,
      duration: action.ms / 1000,
    });
  else if (action.type === "text")
    await request(`/session/${session}/keys`, {
      value: Array.from(action.text),
    });
  else if (action.type === "key" && action.key === "home")
    await execute("mobile: pressButton", { name: "home" });
  else if (action.type === "key" && action.key === "del")
    await request(`/session/${session}/keys`, { value: ["\u0008"] });
  else throw new Error("이 iOS 조작은 지원하지 않아요");
  return Buffer.from("{}");
}
