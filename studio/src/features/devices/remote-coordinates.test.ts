import test from "node:test";
import assert from "node:assert/strict";
import { devicePoint } from "./remote-coordinates.ts";

test("portrait screen maps real device pixels and rejects object-contain side bars", () => {
  const bounds = { left: 20, top: 40, width: 600, height: 600 };
  const screen = { width: 1080, height: 1920 };
  assert.deepEqual(devicePoint(320, 340, bounds, screen), { x: 540, y: 960 });
  assert.equal(devicePoint(30, 340, bounds, screen), null);
  assert.deepEqual(devicePoint(30, 700, bounds, screen, true), {
    x: 0,
    y: 1919,
  });
});

test("landscape rotation maps correctly and unmeasured screens cannot issue input", () => {
  const bounds = { left: 0, top: 0, width: 400, height: 800 };
  const screen = { width: 1920, height: 1080 };
  assert.equal(devicePoint(200, 10, bounds, screen), null);
  assert.deepEqual(devicePoint(200, 400, bounds, screen), { x: 960, y: 540 });
  assert.equal(devicePoint(0, 0, { ...bounds, width: 0 }, screen), null);
});
