import { test } from "node:test";
import assert from "node:assert/strict";
import { hidEvents, grpcFrame } from "./simulator-hid.ts";

test("home emits idb HID down and up, wrapped in uncompressed gRPC frames", () => {
  // Fixtures correspond to idb.proto HIDPress(action.button.HOME, DOWN/UP).
  const events = hidEvents({type:"key",key:"home"})!;
  assert.deepEqual(events.map(e=>e.toString("hex")), ["0a080a04120208011000", "0a080a04120208011001"]);
  assert.equal(grpcFrame(events[0]).toString("hex"), "000000000a0a080a04120208011000");
});
test("tap coordinates use protobuf doubles and swipe keeps requested duration", () => {
  const tap = hidEvents({type:"tap", x:123, y:456})!;
  assert.equal(tap.length,2);
  assert.equal(tap[0].readDoubleLE(9),123);
  assert.equal(tap[0].readDoubleLE(18),456);
  const swipe = hidEvents({type:"swipe",x1:1,y1:2,x2:3,y2:4,ms:350})!;
  assert.equal(swipe.length,1);
  assert.equal(swipe[0].readDoubleLE(swipe[0].length-8),0.35);
});
test("text and unsupported navigation stay on the validated Appium path", () => {
  assert.equal(hidEvents({type:"text",text:"한글"}),undefined);
  assert.equal(hidEvents({type:"key",key:"back"}),undefined);
});
