// Compatibility entry point. Domain/application modules are independently testable.
export { allowed } from "./studio/transport/access.ts";
export { connect } from "./studio/transport/websocket.ts";
export { handle } from "./studio/transport/http.ts";
export { validateAction } from "./studio/domain/validation.ts";
export { script } from "./studio/domain/export.ts";
import { sessions } from "./studio/domain/session.ts";
import { close } from "./studio/application/sessions.ts";
setInterval(() => {
  for (const s of sessions.values())
    if (
      s.state !== "closed" &&
      !s.working &&
      !s.ai &&
      Date.now() - s.updated > 20 * 60000
    )
      void close(s).catch(console.error);
}, 60000).unref();
