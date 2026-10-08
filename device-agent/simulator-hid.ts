import { IdbVideo } from "./idb-video.ts";
import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { connect as connectHttp2, type ClientHttp2Session } from "node:http2";
import { connect as connectSocket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { RemoteAction } from "../server/src/studio/domain/remote-device.ts";

// Wire-compatible subset of Meta idb's MIT-licensed proto/idb.proto, HIDEvent.
// Only fixed numeric fields are encoded; no arbitrary RPC or shell input is accepted.
const message = (field: number, bytes: Buffer) => {
  // These fixed HID messages are all shorter than 128 bytes.
  if (bytes.length >= 128) throw new Error("HID message too large");
  return Buffer.concat([Buffer.from([(field << 3) | 2, bytes.length]), bytes]);
};
const integer = (field: number, value: number) =>
  Buffer.from([field << 3, value]);
const double = (field: number, value: number) => {
  const bytes = Buffer.alloc(9);
  bytes[0] = (field << 3) | 1;
  bytes.writeDoubleLE(value, 1);
  return bytes;
};
const point = (x: number, y: number) =>
  Buffer.concat([double(1, x), double(2, y)]);
const press = (action: Buffer, direction: number) =>
  message(1, Buffer.concat([message(1, action), integer(2, direction)]));
export function hidEvents(action: RemoteAction): Buffer[] | undefined {
  if (action.type === "touch")
    return [
      press(
        message(1, message(1, point(action.x, action.y))),
        action.phase === "up" || action.phase === "cancel" ? 1 : 0,
      ),
    ];
  if (action.type === "swipe")
    return [
      message(
        2,
        Buffer.concat([
          message(1, point(action.x1, action.y1)),
          message(2, point(action.x2, action.y2)),
          double(5, 10),
          double(6, action.ms / 1000),
        ]),
      ),
    ];
  let input: Buffer;
  if (action.type === "tap")
    input = message(1, message(1, point(action.x, action.y)));
  else if (action.type === "key") {
    const buttons: Record<string, number> = {
      home: 1,
      power: 2,
      volume_up: 6,
      volume_down: 7,
    };
    const keys: Record<string, number> = { enter: 40, del: 42, tab: 43 };
    if (action.key in buttons)
      input = message(2, integer(1, buttons[action.key]));
    else if (action.key in keys)
      input = message(3, integer(1, keys[action.key]));
    else return undefined;
  } else return undefined;
  return [press(input, 0), press(input, 1)];
}
export function grpcFrame(payload: Buffer) {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

/** Simulator-only HID bypasses XCTest's per-command idle/snapshot overhead. */
export class SimulatorHid {
  private video = new IdbVideo();
  private heldTouch?: Extract<RemoteAction, { type: "touch" }>;
  private touchTimeout?: ReturnType<typeof setTimeout>;
  private videoRetryAt = 0;
  private child?: ChildProcess;
  private client?: ClientHttp2Session;
  private starting?: Promise<boolean>;
  private disabled = false;
  private stopped = false;
  private readonly udid: string;
  constructor(udid: string) {
    this.udid = udid;
  }
  async perform(action: RemoteAction): Promise<boolean> {
    const events = hidEvents(action);
    if (!events || this.disabled) return false;
    if (!(await this.prepare())) return false;
    const client = this.client!;
    // Never retry after dispatch: a failed response must not duplicate a gesture.
    await new Promise<void>((resolve, reject) => {
      const request = client.request({
        ":method": "POST",
        ":path": "/idb.CompanionService/hid",
        "content-type": "application/grpc",
        te: "trailers",
      });
      let status: string | undefined;
      request.setTimeout(5000, () =>
        request.destroy(new Error("iOS HID timeout")),
      );
      request.on("response", (headers) => {
        if (headers["grpc-status"] !== undefined)
          status = String(headers["grpc-status"]);
      });
      request.on("trailers", (headers) => {
        status = String(headers["grpc-status"]);
      });
      request.on("data", () => {});
      request.on("error", reject);
      request.on("end", () =>
        status === "0" ? resolve() : reject(new Error("iOS HID failed")),
      );
      for (const event of events) request.write(grpcFrame(event));
      request.end();
    });
    if (action.type === "touch") {
      clearTimeout(this.touchTimeout);
      this.heldTouch =
        action.phase === "up" || action.phase === "cancel" ? undefined : action;
      if (this.heldTouch) {
        this.touchTimeout = setTimeout(() => {
          const held = this.heldTouch;
          if (held)
            void this.perform({ ...held, phase: "cancel" }).catch(() => {});
        }, 15000);
        this.touchTimeout.unref();
      }
    }
    return true;
  }
  async prepare(): Promise<boolean> {
    if (this.disabled) return false;
    if (!this.client || this.client.closed || this.client.destroyed) {
      this.starting ??= this.start().finally(() => {
        this.starting = undefined;
      });
      if (!(await this.starting)) return false;
    }
    return true;
  }
  async frame(): Promise<Buffer | undefined> {
    if (Date.now() < this.videoRetryAt || !(await this.prepare()))
      return undefined;
    try {
      // idb VideoStreamRequest.Start: 60 fps, MJPEG, quality .30, scale .3.
      return await this.video.frame(
        this.client!,
        grpcFrame(
          message(
            1,
            Buffer.concat([
              integer(2, 60),
              integer(3, 2),
              double(4, 0.3),
              double(5, 0.3),
            ]),
          ),
        ),
      );
    } catch {
      this.video.stop();
      this.videoRetryAt = Date.now() + 30000;
      console.warn(
        "Simulator 영상 연결을 확인해 주세요. WDA 영상으로 임시 전환해요.",
      );
      return undefined;
    }
  }
  async stop() {
    clearTimeout(this.touchTimeout);
    if (this.heldTouch)
      await this.perform({ ...this.heldTouch, phase: "cancel" }).catch(
        () => {},
      );
    this.video.stop();
    this.stopped = true;
    this.client?.destroy();
    this.child?.kill();
  }
  private async start(): Promise<boolean> {
    if (this.stopped) throw new Error("iOS agent stopped");
    const binaries = [
      process.env.HEIMDALL_IDB_COMPANION,
      "/opt/homebrew/bin/idb_companion",
      "/usr/local/bin/idb_companion",
    ].filter(Boolean) as string[];
    let binary: string | undefined;
    for (const candidate of binaries) {
      try {
        await access(candidate);
        binary = candidate;
        break;
      } catch {
        /* try next installation */
      }
    }
    if (!binary) {
      this.disabled = true;
      console.warn(
        "idb-companion이 없어 느린 XCTest 입력을 사용해요. brew install facebook/fb/idb-companion 으로 설치해 주세요.",
      );
      return false;
    }
    this.video.stop();
    this.client?.destroy();
    this.child?.kill();
    const directory = await mkdtemp(join(tmpdir(), "heimdall-hid-"));
    const socket = join(directory, "grpc.sock");
    // A private Unix socket avoids exposing unauthenticated device RPC on TCP.
    const child = spawn(
      binary,
      [
        "--udid",
        this.udid,
        "--only",
        "simulator",
        "--grpc-domain-sock",
        socket,
        "--log-level",
        "info",
        "--terminate-offline",
        "1",
      ],
      { stdio: "ignore" },
    );
    this.child = child;
    let failed = false;
    child.on("error", () => {
      failed = true;
    });
    child.on("exit", () => {
      failed = true;
      if (this.child === child) this.client?.destroy();
      void rm(directory, { recursive: true, force: true });
    });
    const deadline = Date.now() + 10000;
    for (;;) {
      if (this.stopped || failed || Date.now() > deadline) {
        child.kill();
        await rm(directory, { recursive: true, force: true });
        throw new Error("idb-companion 연결을 확인해 주세요");
      }
      try {
        await access(socket);
        break;
      } catch {
        await delay(25);
      }
    }
    const client = connectHttp2("http://localhost", {
      createConnection: () => connectSocket(socket),
    });
    client.on("error", () => client.destroy());
    this.client = client;
    return true;
  }
}
