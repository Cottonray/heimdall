import { isIos, iosControl } from "./ios-bridge.ts";
import { randomUUID } from "node:crypto";
import * as control from "../../control.ts";
import * as device from "../../device.ts";
import { RemoteDeviceError } from "./remote-device.ts";

export type DeviceLease = {
  viewerId: string;
  serial: string;
  owner: string;
  release: () => void;
  active?: () => boolean;
  onRevoke?: (listener: () => Promise<void>) => void;
};
type HeldLease = DeviceLease & { connections: number; revoked: boolean; listeners: Set<() => Promise<void>> };
const leases = new Map<string, HeldLease>();

/** Reserve synchronously before device preparation so simultaneous opens cannot both win. */
export function reserveDevice(serial: string, owner: string): DeviceLease {
  const controller = isIos(serial) ? iosControl(serial) : control;
  if (!isIos(serial) && serial !== device.target())
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
  if (!controller.claim(viewerId).ok)
    throw new RemoteDeviceError(409, "다른 사용자가 기기를 사용 중이에요");
  const lease: HeldLease = {
    revoked: false,
    listeners: new Set(),
    active: () => !lease.revoked && ownsDevice(viewerId, serial, owner),
    onRevoke: (listener) => { lease.listeners.add(listener); },
    connections: 1,
    viewerId,
    serial,
    owner,
    release() {
      leases.delete(viewerId);
      controller.forget(viewerId);
    },
  };
  leases.set(viewerId, lease);
  return connection(lease);
}

export function ownsDevice(viewerId: string, serial: string, owner: string) {
  const lease = leases.get(viewerId);
  const holder = (isIos(serial) ? iosControl(serial) : control).snapshot();
  return (
    !!lease &&
    !lease.revoked &&
    lease.owner === owner &&
    lease.serial === serial &&
    (isIos(serial) || serial === device.target()) &&
    holder.kind === "human" &&
    holder.viewerId === viewerId
  );
}

export function deviceUsage(serial: string): "available" | "in-use" {
  return (isIos(serial) || serial === device.target()) &&
    (isIos(serial) ? iosControl(serial) : control).snapshot().kind !== "none"
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

/** Admin revocation removes every connection sharing the current human lease. */
export async function releaseDeviceOccupancy(serial: string) {
  if (!isIos(serial) && serial !== device.target())
    throw new RemoteDeviceError(404, "기기를 찾을 수 없어요");
  const controller = isIos(serial) ? iosControl(serial) : control;
  const holder = controller.snapshot();
  if (holder.kind === "runner")
    throw new RemoteDeviceError(409, "자동 테스트가 실행 중이에요. 테스트를 먼저 중지해 주세요.");
  if (holder.kind === "none") return;
  const affected = [...leases.values()].filter((lease) => lease.serial === serial);
  for (const lease of affected) lease.revoked = true;
  await Promise.allSettled(affected.flatMap((lease) => [...lease.listeners].map((listener) => listener())));
  for (const lease of affected) lease.release();
  controller.forget(holder.viewerId);
}
