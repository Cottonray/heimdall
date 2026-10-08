import test from "node:test";
import assert from "node:assert/strict";
import { LegacyTouch } from "./legacy-touch.ts";
test("unsupported HID retains legacy tap/swipe and cancellation never clicks", () => {
  const touch = new LegacyTouch();
  assert.equal(
    touch.accept({ type: "touch", phase: "down", x: 5, y: 6 }, 0),
    undefined,
  );
  assert.deepEqual(
    touch.accept({ type: "touch", phase: "up", x: 5, y: 6 }, 100),
    { type: "tap", x: 5, y: 6 },
  );
  touch.accept({ type: "touch", phase: "down", x: 5, y: 6 }, 200);
  assert.equal(
    touch.accept({ type: "touch", phase: "move", x: 5, y: 90 }, 300),
    undefined,
  );
  assert.deepEqual(
    touch.accept({ type: "touch", phase: "up", x: 5, y: 99 }, 550),
    { type: "swipe", x1: 5, y1: 6, x2: 5, y2: 99, ms: 350 },
  );
  touch.accept({ type: "touch", phase: "down", x: 5, y: 6 }, 600);
  assert.equal(
    touch.accept({ type: "touch", phase: "cancel", x: 5, y: 6 }, 700),
    undefined,
  );
  assert.equal(
    touch.accept({ type: "touch", phase: "up", x: 5, y: 6 }, 800),
    undefined,
  );
});
