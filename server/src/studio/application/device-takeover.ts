import * as control from "../../control.ts";
import * as device from "../../device.ts";
import * as runner from "../../runner.ts";
import { sessions } from "../domain/session.ts";
import { close, exclusiveDevice } from "./sessions.ts";
import { stopAndroidCampaigns } from "./campaigns.ts";
import {
  releaseDeviceOccupancy,
  reserveDevice,
} from "../infrastructure/device-lease.ts";
import { isIos } from "../infrastructure/ios-bridge.ts";
import { RemoteDeviceError } from "../infrastructure/remote-device.ts";

/** Called inside the device queue: finish old input before granting new input. */
export async function prepareDeviceTakeover(serial: string) {
  if (!isIos(serial) && serial !== device.target())
    throw new RemoteDeviceError(
      409,
      "이 기기는 아직 원격 제어를 지원하지 않아요",
    );
  if (!isIos(serial)) {
    await stopAndroidCampaigns();
    runner.cancel("새 기기 실행으로 전환");
    for (const session of sessions.values()) {
      if (session.engine === "android" && session.state !== "closed")
        await close(session);
    }
    const deadline = Date.now() + 15000;
    while (runner.busy() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (runner.busy())
      throw new RemoteDeviceError(
        409,
        "이전 동작을 종료하고 있어요. 잠시 후 다시 실행해 주세요",
      );
    control.unlockRunner();
  }
  await releaseDeviceOccupancy(serial);
}
export function acquireDeviceControl(serial: string, owner: string) {
  return exclusiveDevice(async () => {
    await prepareDeviceTakeover(serial);
    return reserveDevice(serial, owner);
  });
}
