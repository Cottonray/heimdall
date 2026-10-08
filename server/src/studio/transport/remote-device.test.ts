import test from "node:test";
import assert from "node:assert/strict";
import type { DeviceInfo } from "../../../../contracts/studio.ts";
import type { WsConnection, WsHandlers } from "../../ws.ts";
import type { Viewer } from "../../screen.ts";
import * as control from "../../control.ts";
import { remoteAction, displayFromJpeg } from "../domain/remote-device.ts";
import {
  prepareRemoteDevice,
  performRemoteAction,
} from "../infrastructure/remote-device.ts";
import { reserveDevice, deviceUsage } from "../infrastructure/device-lease.ts";
import { connectRemoteDevice } from "./remote-device.ts";

const size = { width: 720, height: 1600 };
const item: DeviceInfo = {
  serial: "emulator-5554",
  state: "device",
  kind: "emulator",
  model: "Pixel",
  selectable: true,
  current: true,
  platform: "android",
  ready: true,
};
const result = (text = "", code: number | null = 0) => ({
  code,
  stdout: Buffer.from(text),
  stderr: "",
});
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("remote inputs reject non-finite/outside coordinates, invalid keys, large text and unsupported commands", () => {
  assert.deepEqual(remoteAction({ type: "tap", x: 719.9, y: 12.4 }, size), {
    type: "tap",
    x: 719,
    y: 12,
  });
  for (const action of [
    { type: "tap", x: 720, y: 3 },
    { type: "tap", x: NaN, y: 3 },
    { type: "tap", x: 3, y: -1 },
    { type: "swipe", x1: 3, y1: 2, x2: 5, y2: 6, ms: 2001 },
    { type: "key", key: "toString" },
    { type: "shell", command: "id" },
    { type: "text", text: "x".repeat(1001) },
    { type: "text", text: "a\nb" },
  ])
    assert.throws(() => remoteAction(action, size));
  assert.deepEqual(remoteAction({ type: "text", text: "헤임달 QA" }, size), {
    type: "text",
    text: "헤임달 QA",
  });
});

test("preflight never selects another device and refuses hidden, offline or changed targets", async () => {
  const calls: string[][] = [];
  const adb = async (args: string[], _timeout?: number, global?: boolean) => {
    assert.equal(global, true);
    calls.push(args);
    return result("Physical size: 1080x2400\nOverride size: 720x1600");
  };
  assert.deepEqual(
    await prepareRemoteDevice(
      item.serial,
      async () => [item],
      () => item.serial,
      adb,
    ),
    { device: item, size },
  );
  assert.deepEqual(calls, [["-s", item.serial, "shell", "wm", "size"]]);
  for (const [serial, list, current] of [
    ["other", [item], item.serial],
    [item.serial, [item], "other"],
    [item.serial, [{ ...item, ready: false }], item.serial],
    ["a;id", [item], item.serial],
  ] as const)
    await assert.rejects(() =>
      prepareRemoteDevice(
        serial,
        async () => [...list],
        () => current,
        adb,
      ),
    );
  assert.equal(calls.length, 1);
  await assert.rejects(
    () =>
      prepareRemoteDevice(
        item.serial,
        async () => [item],
        () => item.serial,
        async () => result("", 1),
      ),
    /크기/,
  );
});

test("every command is pinned to its serial and ADB failure is not reported as success", async () => {
  const calls: string[][] = [];
  const adb = async (args: string[], _timeout?: number, global?: boolean) => {
    assert.equal(global, true);
    calls.push(args);
    return result("Broadcast completed: result=1");
  };
  await performRemoteAction(item.serial, { type: "tap", x: 1, y: 2 }, adb);
  await performRemoteAction(item.serial, { type: "key", key: "home" }, adb);
  await performRemoteAction(item.serial, { type: "text", text: "한글" }, adb);
  await performRemoteAction(
    item.serial,
    { type: "text", text: "'$(id); hello" },
    adb,
  );
  assert.ok(
    calls.every(
      (args) =>
        args[0] === "-s" && args[1] === item.serial && args[2] === "shell",
    ),
  );
  assert.deepEqual(calls[0].slice(3), ["input", "tap", "1", "2"]);
  assert.deepEqual(calls[1].slice(3), ["input", "keyevent", "KEYCODE_HOME"]);
  assert.equal(calls[2].at(-1), Buffer.from("한글").toString("base64"));
  assert.equal(calls[3].at(-1), "''\\''$(id);%shello'");
  await assert.rejects(
    () =>
      performRemoteAction(item.serial, { type: "key", key: "back" }, async () =>
        result("", 1),
      ),
    /전달/,
  );
  await assert.rejects(
    () =>
      performRemoteAction(
        item.serial,
        { type: "text", text: "한글" },
        async () => result("result=0"),
      ),
    /입력칸/,
  );
});

function jpeg(width: number, height: number) {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0, 0, 0, 0, 1]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes;
}
test("JPEG orientation uses physical pixels without trusting truncated dimensions", () => {
  assert.deepEqual(displayFromJpeg(jpeg(360, 800), size), size);
  assert.deepEqual(displayFromJpeg(jpeg(800, 360), size), {
    width: 1600,
    height: 720,
  });
  assert.deepEqual(
    displayFromJpeg(Buffer.from([0xff, 0xd8, 0xff]), size),
    size,
  );
});

function fixture(leased = false) {
  let handlers: WsHandlers = {},
    opened = true;
  let clock = Date.now(),
    target = item.serial,
    allowed = true;
  let timer: (() => void) | undefined, viewer: Viewer | undefined;
  let stopped = false,
    removed = false,
    performed = 0;
  let perform = async () => {
    performed += 1;
  };
  const messages: Record<string, unknown>[] = [],
    closes: number[] = [];
  const ws = {
    get isOpen() {
      return opened;
    },
    backlog: 0,
    lastReceivedAt: clock,
    on(value: WsHandlers) {
      handlers = { ...handlers, ...value };
    },
    send(raw: string) {
      messages.push(JSON.parse(raw));
    },
    sendBinary() {},
    ping() {},
    close(code = 1000) {
      if (!opened) return;
      opened = false;
      closes.push(code);
      handlers.onClose?.();
    },
  } as unknown as WsConnection;
  control.unlockRunner();
  const holder = control.snapshot();
  if (holder.kind === "human") control.forget(holder.viewerId);
  const lease = leased ? reserveDevice(item.serial, "test-session") : undefined;
  connectRemoteDevice(ws, { device: item, size }, async () => allowed, {
    target: () => target,
    now: () => clock,
    control,
    frames: {
      add(value) {
        viewer = value;
      },
      remove() {
        removed = true;
      },
      kick() {},
    },
    perform: async () => perform(),
    every(callback) {
      timer = callback;
      return () => {
        stopped = true;
      };
    },
  }, lease);
  return {
    ws,
    messages,
    closes,
    input(requestId: string, action: unknown) {
      handlers.onMessage?.(
        JSON.stringify({ type: "action", requestId, action }),
      );
    },
    setTarget(value: string) {
      target = value;
    },
    setAllowed(value: boolean) {
      allowed = value;
    },
    setPerform(value: () => Promise<void>) {
      perform = value;
    },
    advance(ms: number) {
      clock += ms;
      timer?.();
    },
    frame(bytes: Buffer) {
      return viewer?.onFrame?.(bytes);
    },
    get performed() {
      return performed;
    },
    get cleaned() {
      return stopped && removed;
    },
  };
}

test("remote connection claims one controller, rejects runner conflict and rechecks auth before input", async () => {
  const f = fixture();
  try {
    assert.equal(f.messages[0].type, "ready");
    assert.equal((f.messages[0].control as { kind: string }).kind, "human");
    f.input("ok", { type: "tap", x: 20, y: 30 });
    await settle();
    assert.equal(f.performed, 1);
    assert.ok(
      f.messages.some((message) => message.requestId === "ok" && message.ok),
    );
    control.lockForRunner("test");
    f.input("busy", { type: "key", key: "back" });
    await settle();
    assert.equal(f.performed, 1);
    assert.ok(
      f.messages.some(
        (message) => message.requestId === "busy" && message.ok === false,
      ),
    );
    control.unlockRunner();
    f.setAllowed(false);
    f.input("expired", { type: "key", key: "back" });
    await settle();
    assert.deepEqual(f.closes, [4401]);
    assert.equal(f.performed, 1);
    assert.equal(f.cleaned, true);
  } finally {
    f.ws.close();
    control.unlockRunner();
  }
});

test("target change blocks even cached frames; a rotated frame updates validated coordinates", async () => {
  const f = fixture();
  try {
    assert.equal(f.frame(jpeg(800, 360)), true);
    assert.ok(
      f.messages.some(
        (message) =>
          message.type === "display" &&
          message.width === 1600 &&
          message.height === 720,
      ),
    );
    f.input("rotated", { type: "tap", x: 1000, y: 300 });
    await settle();
    assert.equal(f.performed, 1);
    f.setTarget("another-phone");
    assert.equal(f.frame(jpeg(360, 800)), false);
    f.input("blocked", { type: "tap", x: 2, y: 2 });
    await settle();
    assert.equal(f.performed, 1);
    assert.deepEqual(f.closes, [4409]);
    assert.equal(f.cleaned, true);
  } finally {
    f.ws.close();
  }
});

test("closing discards queued work, holds the lock only until the started input exits", async () => {
  const f = fixture();
  let finish: () => void = () => {};
  const executing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let count = 0;
  f.setPerform(async () => {
    count += 1;
    await executing;
  });
  f.input("first", { type: "key", key: "back" });
  f.input("second", { type: "key", key: "back" });
  await settle();
  f.ws.close();
  assert.equal(f.cleaned, true);
  assert.equal(control.snapshot().kind, "human");
  finish();
  await settle();
  assert.equal(count, 1);
  assert.equal(control.snapshot().kind, "none");
});

test("dead peers and revoked idle sessions close, and idle control is released", async (t) => {
  const f = fixture();
  f.advance(45001);
  assert.deepEqual(f.closes, [1001]);
  assert.equal(f.cleaned, true);
  const next = fixture();
  next.setAllowed(false);
  next.advance(15000);
  await settle();
  assert.deepEqual(next.closes, [4401]);
  const idle = fixture();
  const future = Date.now() + 91000;
  t.mock.method(Date, "now", () => future);
  idle.advance(1000);
  assert.equal(control.snapshot().kind, "none");
  idle.ws.close();
});

test("reserved viewer releases after 15 seconds without a reply and retains an alive idle window", () => {
  const dead = fixture(true);
  dead.advance(15001);
  assert.deepEqual(dead.closes, [1001]);
  assert.equal(deviceUsage(item.serial), "available");
  const alive = fixture(true);
  for (let i = 0; i < 30; i++) { alive.ws.lastReceivedAt += 5000; alive.advance(5000); }
  assert.equal(alive.ws.isOpen, true);
  assert.equal(deviceUsage(item.serial), "in-use");
  alive.ws.close();
  assert.equal(deviceUsage(item.serial), "available");
});
