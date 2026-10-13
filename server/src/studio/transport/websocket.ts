import { join, leave, watching } from "../application/test-presence.ts";
import { close } from "../application/sessions.ts";
import type { WsConnection } from "../../ws.ts";
import type { PublicSession } from "../domain/types.ts";
import { events } from "../infrastructure/events.ts";
import { get } from "../domain/session.ts";
import { frame } from "../engines/observe.ts";
import { dispatch } from "../application/dispatch.ts";
export function connect(
  ws: WsConnection,
  authorized: () => Promise<boolean> = async () => true,
) {
  const onSession = (session: PublicSession) => {
    if (ws.isOpen && ws.backlog < 65536)
      ws.send(JSON.stringify({ type: "studio", session }));
  };
  events.on("session", onSession);
  let watched = "",
    sending = false;
  const release = (id: string) => {
    if (!id) return;
    leave(id);
    const cleanup = setInterval(() => {
      if (watching(id)) {
        clearInterval(cleanup);
        return;
      }
      try {
        const session = get(id);
        if (session.ai || session.working || session.state === "opening")
          return;
        clearInterval(cleanup);
        void close(session).catch(() => {});
      } catch {
        clearInterval(cleanup);
      }
    }, 30000);
    cleanup.unref();
  };
  const timer = setInterval(async () => {
    if (!watched || sending || !ws.isOpen || ws.backlog > 128000) return;
    sending = true;
    try {
      const id = watched,
        b = await frame(get(id));
      if (id === watched) ws.sendBinary(b);
    } catch {
    } finally {
      sending = false;
    }
  }, 900);
  timer.unref();
  ws.on({
    onClose: () => {
      release(watched);
      events.off("session", onSession);
      clearInterval(timer);
    },
    onMessage: (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === "watch") {
          const next = /^[a-f0-9-]{36}$/.test(msg.id) ? msg.id : "";
          if (next !== watched) {
            release(watched);
            watched = next;
            join(watched);
          }
          return;
        }
        if (msg.type === "action")
          void authorized()
            .then((ok) => {
              if (!ok) throw new Error("로그인이 필요해요");
              return dispatch("qa_action", { id: msg.id, action: msg.action });
            })
            .then((result) =>
              ws.send(
                JSON.stringify({
                  type: "reply",
                  requestId: msg.requestId,
                  result,
                }),
              ),
            )
            .catch((e) =>
              ws.send(
                JSON.stringify({
                  type: "reply",
                  requestId: msg.requestId,
                  error: String(e),
                }),
              ),
            );
      } catch {}
    },
  });
  ws.send(JSON.stringify({ type: "ready" }));
}
