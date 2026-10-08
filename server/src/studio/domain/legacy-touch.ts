import type { RemoteAction } from "./remote-device.ts";
type Touch = Extract<RemoteAction, { type: "touch" }>;
/** Preserve basic clicks/swipes when Simulator HID is unavailable. */
export class LegacyTouch {
  private start?: { x: number; y: number; at: number };
  accept(action: Touch, now = Date.now()): RemoteAction | undefined {
    if (action.phase === "down") {
      this.start = { x: action.x, y: action.y, at: now };
      return;
    }
    if (action.phase === "move") return;
    const start = this.start;
    this.start = undefined;
    if (!start || action.phase === "cancel") return;
    const elapsed = now - start.at;
    if (Math.hypot(action.x - start.x, action.y - start.y) < 8 && elapsed < 500)
      return { type: "tap", x: action.x, y: action.y };
    return {
      type: "swipe",
      x1: start.x,
      y1: start.y,
      x2: action.x,
      y2: action.y,
      ms: Math.round(Math.max(80, Math.min(2000, elapsed))),
    };
  }
}
