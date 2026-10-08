import type { DeviceInfo } from "../../../../contracts/studio.ts";
export type DeviceFilter = "available" | "in-use" | "all";
export function deviceStatus(device: DeviceInfo, lookupFailed = false) {
  if (lookupFailed || device.error) return "상태 확인 불가";
  if (device.state === "unauthorized") return "승인 대기";
  if (device.state === "offline") return "오프라인";
  if (device.state !== "device" || device.ready === undefined)
    return "상태 확인 불가";
  if (!device.ready) return "부팅 중";
  if (!device.current) return "연결 지원 대기";
  if (device.usage === "in-use") return "사용 중";
  return device.usage === "available" ? "사용가능" : "상태 확인 불가";
}
export function matchesDeviceFilter(
  device: DeviceInfo,
  filter: DeviceFilter,
  lookupFailed = false,
) {
  const status = deviceStatus(device, lookupFailed);
  return (
    filter === "all" ||
    (filter === "available" ? status === "사용가능" : status === "사용 중")
  );
}
