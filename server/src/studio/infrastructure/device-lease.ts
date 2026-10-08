import { randomUUID } from "node:crypto";
import * as control from "../../control.ts";
import * as device from "../../device.ts";
import { RemoteDeviceError } from "./remote-device.ts";

export type DeviceLease = {
  viewerId: string;
  serial: string;
  owner: string;
  release: () => void;
};
const leases = new Map<string, DeviceLease>();

/** Reserve synchronously before device preparation so simultaneous opens cannot both win. */
export function reserveDevice(serial: string, owner: string): DeviceLease {
  if (serial !== device.target())
    throw new RemoteDeviceError(
      409,
      "이 기기는 아직 원격 제어를 지원하지 않아요",
    );
  const viewerId = randomUUID();
  if (!control.claim(viewerId).ok)
    throw new RemoteDeviceError(409, "다른 사용자가 기기를 사용 중이에요");
  const lease: DeviceLease = {
    viewerId,
    serial,
    owner,
    release() {
      leases.delete(viewerId);
      control.forget(viewerId);
    },
  };
  leases.set(viewerId, lease);
  return lease;
}

export function ownsDevice(viewerId: string, serial: string, owner: string) {
  const lease = leases.get(viewerId);
  const holder = control.snapshot();
  return (
    !!lease &&
    lease.owner === owner &&
    lease.serial === serial &&
    serial === device.target() &&
    holder.kind === "human" &&
    holder.viewerId === viewerId
  );
}

export function deviceUsage(serial: string): "available" | "in-use" {
  return serial === device.target() && control.snapshot().kind !== "none"
    ? "in-use"
    : "available";
}
