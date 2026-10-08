import test from "node:test";
import assert from "node:assert/strict";
import { listDeviceInventory } from "./device-inventory.ts";
import * as device from "../../device.ts";

const result = (stdout: string, code: number | null = 0) => ({
  stdout: Buffer.from(stdout),
  code,
  stderr: "",
});

test("inventory distinguishes a ready server emulator and retains unavailable authorized devices", async () => {
  const calls: string[][] = [];
  const before = device.target();
  const adb: typeof device.adb = async (args, _timeout, global) => {
    assert.equal(global, true);
    calls.push(args);
    if (args[0] === "devices")
      return result(
        "List of devices attached\nemulator-5554 device model:sdk_gphone64_x86_64\nphone-a unauthorized\nphone-b offline\nprivate-device device model:Private\n",
      );
    if (args[2] === "get-state") return result("device\n");
    return result("1\n");
  };
  const inventory = await listDeviceInventory(adb, [
    "emulator-5554",
    "phone-a",
    "phone-b",
  ]);
  assert.equal(inventory.length, 3);
  assert.equal(inventory[0].kind, "emulator");
  assert.equal(inventory[0].platform, "android");
  assert.equal(inventory[0].ready, true);
  assert.equal(inventory[1].state, "unauthorized");
  assert.equal(inventory[1].ready, false);
  assert.equal(inventory[2].state, "offline");
  assert.deepEqual(calls, [
    ["devices", "-l"],
    ["-s", "emulator-5554", "get-state"],
    ["-s", "emulator-5554", "shell", "getprop", "sys.boot_completed"],
  ]);
  assert.equal(device.target(), before);
});

test("booting and failed state checks never report a ready device", async () => {
  for (const mode of ["booting", "boot-failed", "state-failed"] as const) {
    const adb: typeof device.adb = async (args) => {
      if (args[0] === "devices")
        return result("List of devices attached\nphone device model:Pixel_9\n");
      if (args[2] === "get-state")
        return result("device", mode === "state-failed" ? 1 : 0);
      return mode === "booting" ? result("0") : result("", null);
    };
    const [item] = await listDeviceInventory(adb, ["phone"]);
    assert.equal(item.kind, "real");
    assert.equal(item.ready, false);
    assert.equal(Boolean(item.error), mode !== "booting");
  }
});

test("ADB failure is not confused with a successful empty inventory", async () => {
  await assert.rejects(
    () => listDeviceInventory(async () => result("", 1)),
    /목록을 확인/,
  );
  await assert.rejects(
    () => listDeviceInventory(async () => result("")),
    /목록을 확인/,
  );
  assert.deepEqual(
    await listDeviceInventory(async () =>
      result("List of devices attached\n\n"),
    ),
    [],
  );
});
