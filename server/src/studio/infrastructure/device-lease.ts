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
const leases = new Map<string, DeviceLease & { connections: number }>();

/** Reserve synchronously before device preparation so simultaneous opens cannot both win. */
export function reserveDevice(serial: string, owner: string): DeviceLease {
  if (serial !== device.target())
    throw new RemoteDeviceError(
      409,
      "이 기기는 아직 원격 제어를 지원하지 않아요",
    );
  const existing = [...leases.values()].find(
    (lease) =>
      lease.owner === owner &&
      lease.serial === serial &&
      ownsDevice(lease.viewerId, serial, owner),
  );
  if (existing) {
    existing.connections += 1;
    return connection(existing);
  }
  const viewerId = randomUUID();
  if (!control.claim(viewerId).ok)
    throw new RemoteDeviceError(409, "다른 사용자가 기기를 사용 중이에요");
  const lease: DeviceLease & { connections: number } = {
    connections: 1,
    viewerId,
    serial,
    owner,
    release() {
      leases.delete(viewerId);
      control.forget(viewerId);
    },
  };
  leases.set(viewerId, lease);
  return connection(lease);
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

function connection(lease: DeviceLease & { connections: number }): DeviceLease {
  let released = false;
  return {
    ...lease,
    release() {
      if (released) return;
      released = true;
      lease.connections -= 1;
      if (lease.connections === 0) lease.release();
    },
  };
}
export function deviceOwned(serial: string, owner: string) {
  return [...leases.values()].some((lease) =>
    ownsDevice(lease.viewerId, serial, owner),
  );
}
