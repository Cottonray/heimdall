import test from "node:test";
import assert from "node:assert/strict";
import { mayControlDevice, mayRetryRemoteClose } from "./remote-control.ts";

test("only a ready viewer may claim an idle device or use its own control", () => {
  assert.equal(mayControlDevice(true, { kind: "none" }, "viewer-a"), true);
  assert.equal(
    mayControlDevice(true, { kind: "human", viewerId: "viewer-a" }, "viewer-a"),
    true,
  );
  assert.equal(
    mayControlDevice(true, { kind: "human", viewerId: "viewer-b" }, "viewer-a"),
    false,
  );
  assert.equal(
    mayControlDevice(true, { kind: "human", viewerId: "" }, ""),
    false,
  );
  assert.equal(
    mayControlDevice(true, { kind: "runner", label: "test" }, "viewer-a"),
    false,
  );
  assert.equal(
    mayControlDevice(
      false,
      { kind: "human", viewerId: "viewer-a" },
      "viewer-a",
    ),
    false,
  );
});

test("auth loss and device changes do not enter an automatic reconnect loop", () => {
  for (const code of [4401, 4403, 4404, 4409])
    assert.equal(mayRetryRemoteClose(code), false);
  assert.equal(mayRetryRemoteClose(1006), true);
  assert.equal(mayRetryRemoteClose(1011), true);
});
