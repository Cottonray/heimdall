import { randomUUID } from "node:crypto";
import type { WsConnection } from "../../ws.ts";
import * as device from "../../device.ts";
import * as screen from "../../screen.ts";
import * as control from "../../control.ts";
import { displayFromJpeg, remoteAction } from "../domain/remote-device.ts";
import {
  performRemoteAction,
  type RemoteDevice,
} from "../infrastructure/remote-device.ts";

const runtime = {
  target: device.target,
  frames: screen,
  control,
  perform: performRemoteAction,
  now: Date.now,
  every(callback: () => void) {
    const timer = setInterval(callback, 1000);
    timer.unref();
    return () => clearInterval(timer);
  },
};

type Runtime = {
  target: typeof runtime.target;
  frames: Pick<typeof screen, "add" | "remove" | "kick">;
  control: Pick<
    typeof control,
    "claim" | "mayTouch" | "forget" | "sweep" | "snapshot"
  >;
  perform: typeof performRemoteAction;
  now: typeof Date.now;
  every: typeof runtime.every;
};

export function connectRemoteDevice(
  ws: WsConnection,
  remote: RemoteDevice,
  authorized: () => Promise<boolean>,
  deps: Runtime = runtime,
) {
  const viewerId = randomUUID();
  const serial = remote.device.serial;
  let size = remote.size;
  let closed = false,
    pending = 0,
    checking = false;
  let lastCheck = deps.now(),
    lastPing = deps.now();
  let queue = Promise.resolve();
  const send = (message: unknown) => {
    if (ws.isOpen) ws.send(JSON.stringify(message));
  };
  const fail = (message: string, code: number) => {
    send({ type: "error", error: message });
    ws.close(code);
  };
  const targetUnchanged = () => {
    if (deps.target() === serial) return true;
    fail("기기 상태가 변경됐어요. 다시 열어 주세요", 4409);
    return false;
  };

  const stop = deps.every(() => {
    if (closed) return;
    deps.control.sweep();
    if (!targetUnchanged()) return;
    const now = deps.now();
    if (now - ws.lastReceivedAt > 45000) {
      ws.close(1001);
      return;
    }
    if (now - lastPing >= 15000) {
      lastPing = now;
      ws.ping();
    }
    if (checking || now - lastCheck < 15000) return;
    checking = true;
    lastCheck = now;
    void authorized()
      .then((ok) => {
        if (!ok && !closed) fail("다시 로그인해 주세요", 4401);
      })
      .catch(() => {
        if (!closed) fail("로그인을 확인하지 못했어요", 4401);
      })
      .finally(() => {
        checking = false;
      });
  });

  ws.on({
    onClose: () => {
      if (closed) return;
      closed = true;
      stop();
      deps.frames.remove(viewerId);
      // An already-started ADB command has a 10s bound. Keep its lock until it exits.
      if (!pending) deps.control.forget(viewerId);
    },
    onMessage: (raw) => {
      if (closed) return;
      let message: Record<string, unknown>;
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error();
        message = value as Record<string, unknown>;
      } catch {
        send({ type: "error", error: "요청 형식을 확인해 주세요" });
        return;
      }
      if (message.type !== "action") return;
      const requestId = message.requestId;
      if (typeof requestId !== "string" || requestId.length > 100) return;
      const reply = (ok: boolean, error?: string) =>
        send({ type: "reply", requestId, ok, ...(error ? { error } : {}) });
      if (pending >= 8) {
        reply(false, "이전 조작이 끝나면 다시 시도해 주세요");
        return;
      }
      pending += 1;
      queue = queue
        .then(async () => {
          if (closed || !ws.isOpen || !targetUnchanged()) return;
          const action = remoteAction(message.action, size);
          if (!(await authorized())) {
            fail("다시 로그인해 주세요", 4401);
            return;
          }
          if (closed || !ws.isOpen || !targetUnchanged()) return;
          deps.control.sweep();
          const claim = deps.control.claim(viewerId);
          if (!claim.ok || !deps.control.mayTouch(viewerId))
            throw new Error(
              claim.reason === "runner"
                ? "테스트가 실행 중이에요"
                : "다른 사용자가 조작 중이에요",
            );
          await deps.perform(serial, action);
          if (closed || !targetUnchanged()) return;
          deps.frames.kick();
          reply(true);
        })
        .catch((error: unknown) => {
          reply(
            false,
            error instanceof Error ? error.message : "조작을 완료하지 못했어요",
          );
        })
        .finally(() => {
          pending -= 1;
          if (closed && !pending) deps.control.forget(viewerId);
        });
    },
  });
  if (!targetUnchanged()) return;
  deps.control.sweep();
  deps.control.claim(viewerId);
  send({
    type: "ready",
    device: remote.device,
    width: size.width,
    height: size.height,
    viewerId,
    control: deps.control.snapshot(),
  });
  deps.frames.add({
    id: viewerId,
    ws,
    wantsFrames: true,
    serial,
    onFrame(jpeg) {
      if (closed || !targetUnchanged()) return false;
      const dimensions = displayFromJpeg(jpeg, remote.size);
      if (
        size.width !== dimensions.width ||
        size.height !== dimensions.height
      ) {
        size = dimensions;
        send({ type: "display", ...size });
      }
      return true;
    },
  });
}
