import { subscribeAgentFrames } from "../infrastructure/agent-registry.ts";
import * as stream from "../../stream.ts";
import { isIos, iosRequest, iosControl } from "../infrastructure/ios-bridge.ts";
import { randomUUID } from "node:crypto";
import type { DeviceLease } from "../infrastructure/device-lease.ts";
import type { WsConnection } from "../../ws.ts";
import * as device from "../../device.ts";
import * as screen from "../../screen.ts";
import * as control from "../../control.ts";
import {
  displayFromJpeg,
  remoteAction,
  type RemoteAction,
} from "../domain/remote-device.ts";
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
  lease?: DeviceLease,
) {
  if (isIos(remote.device.serial) && deps === runtime) {
    const serial = remote.device.serial;
    const clients = new Map<string, () => void>();
    deps = {
      ...runtime,
      target: () => serial,
      control: iosControl(serial),
      frames: {
        kick() {},
        remove(id) {
          clients.get(id)?.();
          clients.delete(id);
        },
        add(client) {
          const subscribed = subscribeAgentFrames(serial, {
            frame(jpeg) {
              if (
                client.ws.isOpen &&
                client.ws.backlog < 128 * 1024 &&
                client.onFrame?.(jpeg) !== false
              )
                client.ws.sendBinary(jpeg);
            },
            error() {
              client.ws.close(1011);
            },
          });
          if (subscribed) {
            clients.set(client.id, subscribed);
            return;
          }
          let pending = false;
          const tick = async () => {
            if (pending || !client.ws.isOpen || client.ws.backlog > 128 * 1024)
              return;
            pending = true;
            try {
              const png = await iosRequest(
                `/frame?serial=${encodeURIComponent(serial)}`,
              );
              if (
                client.ws.isOpen &&
                client.ws.backlog < 128 * 1024 &&
                client.onFrame?.(png) !== false
              )
                client.ws.sendBinary(png);
            } catch {
              client.ws.close(1011);
            } finally {
              pending = false;
            }
          };
          const timer = setInterval(() => void tick(), 40);
          clients.set(client.id, () => clearInterval(timer));
          void tick();
        },
      },
    };
  }
  const supportsVideo = deps === runtime && !isIos(remote.device.serial);
  let video = false;
  const viewerId = lease?.viewerId || randomUUID();
  const connectionId = randomUUID();
  const serial = remote.device.serial;
  let size = remote.size;
  let closed = false,
    pending = 0,
    checking = false;
  let lastCheck = deps.now(),
    lastPing = deps.now();
  let queue = Promise.resolve();
  let held: Extract<RemoteAction, { type: "touch" }> | undefined;
  let touchedAt = 0;
  let heldStream = false;
  async function releaseTouch() {
    const previous = held;
    held = undefined;
    const usedStream = heldStream;
    heldStream = false;
    if (!previous || deps.target() !== serial) return;
    const action = { ...previous, phase: "cancel" as const };
    if (usedStream && stream.touch(action.phase, action.x, action.y, size))
      return;
    await deps.perform(serial, action);
  }
  function releaseLease() {
    if (!lease) deps.control.forget(viewerId);
    lease?.release();
  }
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
    if (lease && !deps.control.mayTouch(viewerId)) {
      fail("기기 점유가 종료됐어요. 다시 열어 주세요", 4409);
      return;
    }
    if (held && deps.now() - touchedAt > 10000) {
      touchedAt = deps.now();
      queue = queue.then(releaseTouch).catch(() => {});
    }
    deps.control.sweep();
    if (!targetUnchanged()) return;
    const now = deps.now();
    if (now - ws.lastReceivedAt > (lease ? 15000 : 45000)) {
      ws.close(1001);
      return;
    }
    if (now - lastPing >= (lease ? 5000 : 15000)) {
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
      deps.frames.remove(connectionId);
      if (video) stream.removeViewer(connectionId);
      // Release a held finger before handing the lease to another viewer.
      if (!pending && !held) releaseLease();
      else
        void queue
          .then(releaseTouch)
          .catch(() => {})
          .finally(releaseLease);
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
      if (message.type === "video" && supportsVideo) {
        const enabled = message.enabled === true;
        if (enabled !== video) {
          video = enabled;
          if (video) stream.addViewer(connectionId, ws);
          else stream.removeViewer(connectionId);
          screen.setWantsFrames(connectionId, !video);
          if (!video) {
            size = remote.size;
            send({ type: "display", ...size });
            deps.frames.kick();
          }
        }
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
          if (video && stream.videoSize()) size = stream.videoSize()!;
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
          if (action.type === "touch") {
            if (action.phase === "down" && held) await releaseTouch();
            if (action.phase !== "down" && !held) {
              reply(true);
              return;
            }
            if (action.phase === "down") heldStream = video && supportsVideo;
            held = action;
            touchedAt = deps.now();
          } else if (held) await releaseTouch();
          let injected = false;
          if (action.type === "touch" && heldStream)
            injected = stream.touch(action.phase, action.x, action.y, size);
          if (
            !injected &&
            video &&
            stream.ready() &&
            serial === device.target()
          ) {
            if (action.type === "tap")
              injected = await stream.tap(action.x, action.y, size);
            else if (action.type === "swipe")
              injected = await stream.swipe(
                action.x1,
                action.y1,
                action.x2,
                action.y2,
                action.ms,
                size,
              );
            else if (action.type === "key")
              injected = await stream.key(action.key);
            else if (action.type === "text")
              injected = stream.text(action.text);
          }
          if (!injected) {
            if (action.type === "touch" && heldStream)
              throw new Error("영상 연결을 기다려 주세요");
            if (video && (action.type === "tap" || action.type === "swipe"))
              throw new Error("영상 연결을 기다려 주세요");
            await deps.perform(serial, action);
          }
          if (
            action.type === "touch" &&
            (action.phase === "up" || action.phase === "cancel")
          )
            held = undefined;
          if (closed || !targetUnchanged()) return;
          deps.frames.kick();
          reply(true);
        })
        .catch(async (error: unknown) => {
          await releaseTouch().catch(() => {});
          reply(
            false,
            error instanceof Error ? error.message : "조작을 완료하지 못했어요",
          );
        })
        .finally(() => {
          pending -= 1;
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
    id: connectionId,
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
