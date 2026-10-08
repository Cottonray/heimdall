import { iosWebDebug } from "../server/src/studio/domain/ios-web-debug.ts";
import { remoteAction } from "../server/src/studio/domain/remote-device.ts";
import { execFile } from "node:child_process";
import { SimulatorHid } from "./simulator-hid.ts";
import { LatestJpeg } from "./mjpeg.ts";
import { displayFromJpeg } from "../server/src/studio/domain/remote-device.ts";
import { promisify } from "node:util";
const exec = promisify(execFile);
const udid = process.env.HEIMDALL_IOS_UDID;
if (!udid || !/^[A-Fa-f0-9-]{36}$/.test(udid))
  throw new Error("--device UUID가 필요해요");
const serial = `ios:${udid}`;
const appium = "http://127.0.0.1:4725";
let session = process.env.HEIMDALL_IOS_SESSION || "";
let starting: Promise<void> | undefined;
let size: { width: number; height: number } | undefined;
const video = new LatestJpeg();
const hid = new SimulatorHid(udid);
let nativeCommands = Promise.resolve<unknown>(undefined);
export function stop() {
  video.stop();
  hid.stop();
}
let commands = Promise.resolve<unknown>(undefined);
async function request(path: string, body?: unknown) {
  const res = await fetch(appium + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(path === "/session" ? 180000 : 10000),
  });
  const json = (await res.json()) as { value: any };
  if (!res.ok || json.value?.error) {
    if (json.value?.error === "invalid session id") {
      session = "";
      size = undefined;
      video.stop();
    }
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
            "appium:waitForIdleTimeout": 0,
            "appium:webviewConnectTimeout": 3000,
            "appium:includeSafariInWebviews": true,
            "appium:additionalWebviewBundleIds": ["*"],
            "appium:webviewConnectRetries": 2,
            "appium:webkitResponseTimeout": 5000,
            "appium:settings": {
              animationCoolOffTimeout: 0,
              mjpegServerFramerate: 15,
              mjpegScalingFactor: 30,
              mjpegServerScreenshotQuality: 30,
            },
          },
        },
      });
      session = value.sessionId;
    })().finally(() => {
      starting = undefined;
    });
    await starting;
  }
  size ??= await request(`/session/${session}/window/rect`);
  return size!;
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
export function perform(path: string, body?: unknown): Promise<Buffer> {
  // Video never waits for a web-context switch, animation or text command.
  if (new URL(path, "http://localhost").pathname === "/frame")
    return run(path, body);
  if (new URL(path, "http://localhost").pathname === "/action") {
    const next = nativeCommands.then(() => run(path, body));
    nativeCommands = next.catch(() => undefined);
    return next;
  }
  const next = commands.then(() => run(path, body));
  commands = next.catch(() => undefined);
  return next;
}
async function run(path: string, body?: unknown): Promise<Buffer> {
  const url = new URL(path, "http://localhost");
  if (url.searchParams.get("serial") !== serial)
    throw new Error("허용되지 않은 기기예요");
  const dimensions = await prepare();
  if (url.pathname === "/prepare") {
    await hid.prepare();
    return Buffer.from(
      JSON.stringify({ width: dimensions.width, height: dimensions.height }),
    );
  }
  if (url.pathname === "/frame") {
    const frame = await video.frame();
    size = displayFromJpeg(frame, dimensions);
    return frame;
  }
  if (url.pathname === "/webviews") {
    const contexts = (await execute("mobile: getContexts", {
      waitForWebviewMs: 0,
    })) as { id: string; title?: string; url?: string; bundleId?: string }[];
    return Buffer.from(
      JSON.stringify({
        targets: contexts
          .filter((c) => c.id.startsWith("WEBVIEW_"))
          .map((c) => ({
            socket: "webkit",
            id: c.id,
            title: c.title || "",
            url: c.url || "",
            kind:
              c.bundleId === "com.apple.mobilesafari" ? "browser" : "webview",
          })),
        unavailable: 0,
      }),
    );
  }
  if (url.pathname === "/web-debug") {
    const debug = iosWebDebug(body);
    try {
      await request(`/session/${session}/context`, { name: debug.context });
      const script =
        debug.operation === "dom"
          ? "return document.documentElement.outerHTML.slice(0, 200000)"
          : debug.operation === "resources"
            ? "return JSON.stringify(performance.getEntriesByType('resource').slice(-200).map(e => ({url:e.name,type:e.initiatorType,durationMs:Math.round(e.duration),bytes:e.transferSize})),null,2)"
            : "try { const v = (0,eval)(arguments[0]); if (v && typeof v.then === 'function') return 'Promise 반환값이에요. 동기 표현식으로 확인해 주세요.'; return typeof v === 'string' ? v.slice(0,200000) : String(JSON.stringify(v,null,2)).slice(0,200000); } catch(e) { return String(e); }";
      const result = await request(`/session/${session}/execute/sync`, {
        script,
        args: debug.operation === "evaluate" ? [debug.expression] : [],
      });
      return Buffer.from(
        JSON.stringify({
          result: String(result ?? "undefined").slice(0, 200000),
        }),
      );
    } finally {
      await request(`/session/${session}/context`, { name: "NATIVE_APP" });
    }
  }
  if (url.pathname !== "/action") throw new Error("지원하지 않는 요청이에요");
  const action = remoteAction(body, dimensions);
  if (await hid.perform(action)) return Buffer.from("{}");
  // Appium text/context operations share one queue; HID stays independent.
  const next = commands.then(() => legacyInput(action));
  commands = next.catch(() => undefined);
  return next;
}
async function legacyInput(action: ReturnType<typeof remoteAction>) {
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
