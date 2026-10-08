export type TouchInput = {
  type: "touch";
  phase: "down" | "move" | "up" | "cancel";
  x: number;
  y: number;
};

/** Keep transition order, replace stale moves, and bound transport work. */
export function createTouchInput(
  send: (id: string, action: TouchInput) => void,
  failed: (message: string) => void,
) {
  let queue: TouchInput[] = [];
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  function stop() {
    stopped = true;
    clearTimeout(scheduled);
    pending.forEach(clearTimeout);
    pending.clear();
    queue = [];
  }
  function fail(message: string) {
    stop();
    failed(message);
  }
  function pump() {
    scheduled = undefined;
    while (!stopped && pending.size < 3 && queue.length) {
      const action = queue.shift()!;
      const id = `touch:${crypto.randomUUID()}`;
      pending.set(
        id,
        setTimeout(() => fail("터치 응답이 늦어요. 다시 연결해 주세요."), 5000),
      );
      try {
        send(id, action);
      } catch {
        fail("기기 연결이 끊겼어요. 다시 연결해 주세요.");
      }
    }
  }
  return {
    push(action: TouchInput) {
      if (stopped) return false;
      if (action.phase === "move" && queue.at(-1)?.phase === "move")
        queue[queue.length - 1] = action;
      else if (queue.length < 8) queue.push(action);
      else {
        fail("터치 연결이 지연되고 있어요. 다시 연결해 주세요.");
        return false;
      }
      // Down/up dispatch immediately; moves are limited to one per display tick.
      if (action.phase !== "move") {
        clearTimeout(scheduled);
        pump();
      } else scheduled ??= setTimeout(pump, 16);
      return true;
    },
    reply(id: string, ok: boolean, error?: string) {
      const timer = pending.get(id);
      if (!timer) return;
      clearTimeout(timer);
      pending.delete(id);
      if (!ok) fail(error || "터치를 전달하지 못했어요.");
      else pump();
    },
    stop,
  };
}
