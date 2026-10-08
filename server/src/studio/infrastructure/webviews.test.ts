import test from "node:test";
import assert from "node:assert/strict";
import {
  debuggingSockets,
  parseTarget,
  discoverWebViews,
  openWebView,
} from "./webviews.ts";
import { assetPath } from "../transport/devtools-assets.ts";
import { reserveDevice, ownsDevice, deviceUsage } from "./device-lease.ts";
import * as control from "../../control.ts";
const serial = "emulator-5554";
const socket = "webview_devtools_remote_123";
const page = {
  type: "page",
  id: "ABC123",
  title: "Web page",
  url: "https://example.com/",
  webSocketDebuggerUrl: "ws://attacker.example/devtools/page/ABC123",
  devtoolsFrontendUrl: `https://attacker.example/serve_rev/@${"a".repeat(40)}/inspector.html`,
};
const output = (text: string, code = 0) => ({
  code,
  stdout: Buffer.from(text),
  stderr: "",
});
function runtime(rows: unknown = [page], failing = false) {
  const calls: string[][] = [];
  const deps = {
    adb: async (args: string[]) => {
      calls.push(args);
      if (args.includes("/proc/net/unix")) return output(`000: 000 @${socket}`);
      return output("32123");
    },
    prepare: async () => ({
      device: {
        serial,
        state: "device",
        kind: "emulator" as const,
        model: "Pixel",
        selectable: true,
        current: true,
        platform: "android" as const,
        ready: true,
      },
      size: { width: 720, height: 1600 },
    }),
    fetch: (async (url: string | URL | Request) => {
      assert.equal(String(url), "http://127.0.0.1:32123/json/list");
      if (failing) throw new Error("disconnected");
      return new Response(JSON.stringify(rows));
    }) as typeof fetch,
  };
  return { deps, calls };
}
test("discovery limits socket types, deduplicates and ignores shell metacharacters", () => {
  assert.deepEqual(
    debuggingSockets(
      `x @${socket}\nx @${socket}\nx @chrome_devtools_remote\nx @evil;id\nx @unrelated`,
    ),
    [socket, "chrome_devtools_remote"],
  );
});
test("CDP connection ignores supplied hosts and rejects non-page/debugger path mismatches", () => {
  assert.equal(parseTarget(socket, page)?.revision, "@" + "a".repeat(40));
  assert.equal(parseTarget(socket, {...page, devtoolsFrontendUrl: page.devtoolsFrontendUrl.replace("serve_rev", "serve_internal_file")})?.revision, "@" + "a".repeat(40));
  assert.equal(parseTarget(socket, { ...page, type: "browser" }), null);
  assert.equal(
    parseTarget(socket, {
      ...page,
      webSocketDebuggerUrl: "ws://localhost/devtools/browser/ABC123",
    }),
    null,
  );
  assert.equal(parseTarget(socket, { ...page, id: "../other" }), null);
  assert.equal(
    parseTarget(socket, {
      ...page,
      webSocketDebuggerUrl: "ws://localhost/devtools/page/another",
    }),
    null,
  );
});
test("discovery cleans up forwards on success and errors without inventing an empty success", async () => {
  for (const failing of [false, true]) {
    const { deps, calls } = runtime([page], failing);
    const result = await discoverWebViews(serial, deps);
    assert.equal(result.targets.length, failing ? 0 : 1);
    assert.equal(result.unavailable, failing ? 1 : 0);
    assert.deepEqual(calls.at(-1), [
      "-s",
      serial,
      "forward",
      "--remove",
      "tcp:32123",
    ]);
  }
});
test("inspector revalidates live target and releases only its own forward once", async () => {
  const { deps, calls } = runtime();
  const connection = await openWebView(serial, socket, page.id, deps);
  assert.equal(connection.url, "ws://127.0.0.1:32123/devtools/page/ABC123");
  await connection.release();
  await connection.release();
  assert.equal(calls.filter((call) => call.includes("--remove")).length, 1);
  const missing = runtime([]);
  await assert.rejects(
    openWebView(serial, socket, page.id, missing.deps),
    /닫혔/,
  );
  assert.ok(missing.calls.at(-1)?.includes("--remove"));
  const invalid = runtime();
  await assert.rejects(openWebView(serial, "../socket", page.id, invalid.deps));
  assert.equal(invalid.calls.length, 0);
});
test("asset proxy accepts only immutable Chromium revision assets", () => {
  const prefix = "/api/studio/devtools/";
  assert.equal(
    assetPath(
      prefix + `serve_rev/@${"a".repeat(40)}/panels/elements/elements.js`,
    ),
    `serve_rev/@${"a".repeat(40)}/panels/elements/elements.js`,
  );
  for (const value of [
    "https://example.com/x.js",
    "serve_rev/@main/inspector.html",
    `serve_rev/@${"a".repeat(40)}/../private.js`,
    `serve_rev/@${"a".repeat(40)}/%2e%2e/private.js`,
  ])
    assert.equal(assetPath(prefix + value), null);
});
test("device reservation is exclusive, bound to login and released on close", () => {
  control.unlockRunner();
  const old = control.snapshot();
  if (old.kind === "human") control.forget(old.viewerId);
  const lease = reserveDevice(serial, "session-a");
  try {
    assert.equal(deviceUsage(serial), "in-use");
    assert.throws(() => reserveDevice(serial, "session-b"), /사용 중/);
    assert.equal(ownsDevice(lease.viewerId, serial, "session-a"), true);
    assert.equal(ownsDevice(lease.viewerId, serial, "session-b"), false);
    assert.equal(ownsDevice(lease.viewerId, "other", "session-a"), false);
    control.lockForRunner("test");
    assert.equal(ownsDevice(lease.viewerId, serial, "session-a"), false);
  } finally {
    lease.release();
    control.unlockRunner();
  }
  assert.equal(deviceUsage(serial), "available");
  const next = reserveDevice(serial, "session-b");
  next.release();
});

test("same login can reopen a device without releasing its other window", () => {
 const first = reserveDevice(serial, "same-login");
 const second = reserveDevice(serial, "same-login");
 assert.equal(first.viewerId, second.viewerId);
 first.release(); first.release();
 assert.equal(ownsDevice(second.viewerId, serial, "same-login"), true);
 assert.throws(() => reserveDevice(serial, "other-login"), /사용 중/);
 second.release();
 assert.equal(deviceUsage(serial), "available");
});
