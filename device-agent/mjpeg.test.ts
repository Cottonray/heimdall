import test from "node:test";
import assert from "node:assert/strict";
import { JpegParser } from "./mjpeg.ts";
import { iosWebDebug } from "../server/src/studio/domain/ios-web-debug.ts";
test("multipart frames survive every TCP split and multiple images in one chunk", () => {
  const jpeg = Buffer.from([255, 216, 1, 2, 3, 255, 217]);
  const wire = Buffer.concat([
    Buffer.from("--boundary\r\nContent-Type: image/jpeg\r\n\r\n"),
    jpeg,
    Buffer.from("\r\n--boundary\r\n"),
    jpeg,
  ]);
  for (let i = 1; i < wire.length; i++) {
    const parser = new JpegParser();
    assert.deepEqual(
      [...parser.feed(wire.subarray(0, i)), ...parser.feed(wire.subarray(i))],
      [jpeg, jpeg],
    );
  }
});
test("oversized and unfinished video frames remain bounded", () => {
  const parser = new JpegParser();
  assert.deepEqual(
    parser.feed(
      Buffer.concat([
        Buffer.from([255, 216]),
        Buffer.alloc(500001),
        Buffer.from([255, 217]),
      ]),
    ),
    [],
  );
  assert.throws(() =>
    parser.feed(
      Buffer.concat([Buffer.from([255, 216]), Buffer.alloc(2000001)]),
    ),
  );
});
test("iOS debugger accepts only bounded web contexts and operations", () => {
  assert.equal(
    iosWebDebug({
      context: "WEBVIEW_12.3",
      operation: "evaluate",
      expression: "document.title",
    }).operation,
    "evaluate",
  );
  for (const value of [
    null,
    { context: "NATIVE_APP", operation: "evaluate", expression: "x" },
    { context: "WEBVIEW_a", operation: "shell" },
    {
      context: "WEBVIEW_a",
      operation: "evaluate",
      expression: "x".repeat(10001),
    },
  ])
    assert.throws(() => iosWebDebug(value));
});
