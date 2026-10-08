import { EventEmitter } from "node:events";
import type { Session } from "../../../../contracts/studio.ts";
export const events = new EventEmitter();
export function publish(session: Session) {
  events.emit("session", session);
}
