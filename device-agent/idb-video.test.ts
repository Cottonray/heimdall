import test from "node:test";
import assert from "node:assert/strict";
import { IdbVideoParser } from "./idb-video.ts";
import { grpcFrame } from "./simulator-hid.ts";
const jpeg = Buffer.from([255, 216, 1, 2, 3, 255, 217]);
const payload = (bytes: Buffer) =>
  grpcFrame(
    Buffer.concat([
      Buffer.from([18, bytes.length + 2, 18, bytes.length]),
      bytes,
    ]),
  );
test("idb video parses every gRPC/HTTP2 split and ignores log messages", () => {
  const wire = Buffer.concat([
    grpcFrame(Buffer.from([10, 3, 97, 98, 99])),
    payload(jpeg),
    payload(jpeg),
  ]);
  for (let split = 1; split < wire.length; split++) {
    const parser = new IdbVideoParser();
    assert.deepEqual(
      [
        ...parser.feed(wire.subarray(0, split)),
        ...parser.feed(wire.subarray(split)),
      ],
      [jpeg, jpeg],
    );
  }
});
test("JPEG may span multiple idb payload messages", () => {
  const parser = new IdbVideoParser();
  assert.deepEqual(parser.feed(payload(jpeg.subarray(0, 3))), []);
  assert.deepEqual(parser.feed(payload(jpeg.subarray(3))), [jpeg]);
});
test("compressed, oversized and truncated protobuf messages fail closed", () => {
  assert.throws(() => new IdbVideoParser().feed(Buffer.from([1, 0, 0, 0, 0])));
  const large = Buffer.alloc(5);
  large.writeUInt32BE(1000001, 1);
  assert.throws(() => new IdbVideoParser().feed(large));
  assert.throws(() =>
    new IdbVideoParser().feed(grpcFrame(Buffer.from([18, 9, 18, 7]))),
  );
});
