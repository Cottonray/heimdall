import type { DeviceInfo } from "../../../../contracts/studio.ts";
import * as device from "../../device.ts";
import {
  REMOTE_KEYS,
  type DisplaySize,
  type RemoteAction,
} from "../domain/remote-device.ts";
import { listDeviceInventory } from "./device-inventory.ts";

export type RemoteDevice = { device: DeviceInfo; size: DisplaySize };

export class RemoteDeviceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function prepareRemoteDevice(
  serial: string,
  inventory: () => Promise<DeviceInfo[]> = listDeviceInventory,
  target: () => string = device.target,
  adb: typeof device.adb = device.adb,
): Promise<RemoteDevice> {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(serial))
    throw new RemoteDeviceError(400, "기기 ID를 확인해 주세요");
  const item = (await inventory()).find((entry) => entry.serial === serial);
  if (!item) throw new RemoteDeviceError(404, "기기를 찾을 수 없어요");
  if (serial !== target())
    throw new RemoteDeviceError(
      409,
      "이 기기는 아직 원격 제어를 지원하지 않아요",
    );
  if (item.platform !== "android" || !item.ready || item.error)
    throw new RemoteDeviceError(409, "기기가 준비되면 다시 열어 주세요");
  const result = await adb(["-s", serial, "shell", "wm", "size"], 5000, true);
  const dimensions = [
    ...result.stdout.toString("utf8").matchAll(/(\d+)x(\d+)/g),
  ].at(-1);
  if (result.code !== 0 || !dimensions)
    throw new RemoteDeviceError(503, "기기 화면 크기를 확인하지 못했어요");
  const size = { width: Number(dimensions[1]), height: Number(dimensions[2]) };
  if (
    size.width < 1 ||
    size.height < 1 ||
    size.width > 10000 ||
    size.height > 10000 ||
    serial !== target()
  )
    throw new RemoteDeviceError(
      409,
      "기기 상태가 변경됐어요. 다시 열어 주세요",
    );
  return { device: item, size };
}

/** Explicit -s remains bound to this viewer even if the default target changes. */
export async function performRemoteAction(
  serial: string,
  action: RemoteAction,
  adb: typeof device.adb = device.adb,
) {
  let args: string[];
  let unicode = false;
  switch (action.type) {
    case "tap":
      args = ["input", "tap", String(action.x), String(action.y)];
      break;
    case "swipe":
      args = [
        "input",
        "swipe",
        ...[action.x1, action.y1, action.x2, action.y2, action.ms].map(String),
      ];
      break;
    case "key":
      args = ["input", "keyevent", REMOTE_KEYS[action.key]];
      break;
    case "text":
      unicode = /[^\x20-\x7e]/u.test(action.text);
      args = unicode
        ? [
            "am",
            "broadcast",
            "-a",
            "com.aidemo.qaime.TEXT",
            "--es",
            "b64",
            Buffer.from(action.text, "utf8").toString("base64"),
          ]
        : [
            "input",
            "text",
            "'" + action.text.replace(/'/g, "'\\''").replace(/ /g, "%s") + "'",
          ];
      break;
  }
  const result = await adb(["-s", serial, "shell", ...args], 10000, true);
  if (result.code !== 0) throw new Error("기기에 입력을 전달하지 못했어요");
  if (unicode && !/result=1\b/.test(result.stdout.toString("utf8")))
    throw new Error("입력칸과 QA 키보드를 확인해 주세요");
  device.invalidateDump();
}
