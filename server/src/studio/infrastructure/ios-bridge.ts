import { agentDevices, agentRequest } from "./agent-registry.ts";
export const isIos = (serial: string) => /^ios:[A-Fa-f0-9-]{36}$/.test(serial);
export const iosRequest = agentRequest;
export async function iosInventory() {
  return agentDevices();
}
const owners = new Map<string, string>();
export function iosControl(serial: string) {
  return {
    claim(viewer: string) {
      const held = owners.get(serial);
      if (held && held !== viewer) return { ok: false, reason: "taken" };
      owners.set(serial, viewer);
      return { ok: true };
    },
    mayTouch(viewer: string) {
      return owners.get(serial) === viewer;
    },
    forget(viewer: string) {
      if (owners.get(serial) === viewer) owners.delete(serial);
    },
    sweep() {},
    snapshot() {
      const viewerId = owners.get(serial);
      return viewerId
        ? { kind: "human" as const, viewerId }
        : { kind: "none" as const };
    },
  };
}
