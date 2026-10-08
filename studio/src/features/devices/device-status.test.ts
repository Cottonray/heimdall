import test from "node:test";
import assert from "node:assert/strict";
import { deviceStatus, matchesDeviceFilter } from "./device-status.ts";
import type { DeviceInfo } from "../../../../contracts/studio.ts";
const item: DeviceInfo = {
  serial: "emulator-5554",
  state: "device",
  model: "Pixel",
  kind: "emulator",
  platform: "android",
  selectable: true,
  current: true,
  ready: true,
  usage: "available",
};
test("default available filter excludes occupied, unknown, offline and unsupported devices", () => {
  assert.equal(deviceStatus(item), "사용가능");
  assert.equal(matchesDeviceFilter(item, "available"), true);
  for (const device of [
    { ...item, usage: "in-use" as const },
    { ...item, usage: undefined },
    { ...item, ready: false },
    { ...item, state: "offline" },
    { ...item, current: false },
    { ...item, error: "ADB error" },
  ])
    assert.equal(matchesDeviceFilter(device, "available"), false);
  assert.equal(matchesDeviceFilter(item, "available", true), false);
  assert.equal(
    matchesDeviceFilter({ ...item, usage: "in-use" }, "in-use"),
    true,
  );
  assert.equal(matchesDeviceFilter({ ...item, state: "offline" }, "all"), true);
});
