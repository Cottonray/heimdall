import type { DeviceInfo } from "../../../../contracts/studio.ts";
import * as device from "../../device.ts";

function publicSerials() {
  return (
    process.env.AIQA_PUBLIC_SERIALS ??
    process.env.AIQA_SERIAL ??
    "emulator-5554"
  )
    .split(",")
    .map((serial) => serial.trim())
    .filter(Boolean);
}

/** Reads the server's inventory without selecting, starting or stopping a device. */
export async function listDeviceInventory(
  adb: typeof device.adb = device.adb,
  visible = publicSerials(),
): Promise<DeviceInfo[]> {
  const result = await adb(["devices", "-l"], 8000, true);
  const lines = result.stdout.toString("utf8").split(/\r?\n/);
  const header = lines.findIndex(
    (line) => line.trim() === "List of devices attached",
  );
  if (result.code !== 0 || header < 0)
    throw new Error("기기 목록을 확인하지 못했어요. 잠시 후 새로고침해 주세요");
  const inventory: DeviceInfo[] = [];
  for (const line of lines.slice(header + 1)) {
    const match = /^(\S+)\s+(\S+)(.*)$/.exec(line);
    if (!match) continue;
    const [, serial, state, rest] = match;
    if (!visible.includes("*") && !visible.includes(serial)) continue;
    inventory.push({
      serial,
      state,
      kind: serial.startsWith("emulator-") ? "emulator" : "real",
      model: rest.match(/model:(\S+)/)?.[1]?.replace(/_/g, " ") || "",
      selectable: true,
      current: serial === device.target(),
      platform: "android",
      ready: false,
    });
  }
  return Promise.all(
    inventory.map(async (item) => {
      if (item.state !== "device") return item;
      try {
        const state = await adb(["-s", item.serial, "get-state"], 5000, true);
        if (
          state.code !== 0 ||
          state.stdout.toString("utf8").trim() !== "device"
        )
          return { ...item, error: "기기 상태를 확인하지 못했어요" };
        const boot = await adb(
          ["-s", item.serial, "shell", "getprop", "sys.boot_completed"],
          5000,
          true,
        );
        const value = boot.stdout.toString("utf8").trim();
        if (boot.code !== 0 || !["", "0", "1"].includes(value))
          return { ...item, error: "기기 준비 상태를 확인하지 못했어요" };
        return { ...item, ready: value === "1" };
      } catch {
        return { ...item, error: "기기 상태를 확인하지 못했어요" };
      }
    }),
  );
}
