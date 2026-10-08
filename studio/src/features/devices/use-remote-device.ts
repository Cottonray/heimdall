import { createTouchInput, type TouchInput } from "./touch-input";
import { createVideoRenderer } from "./video-decoder";
import { useEffect, useRef, useState } from "react";
import type { DeviceInfo } from "../../../../contracts/studio";
import {
  mayControlDevice,
  mayRetryRemoteClose,
  type RemoteControl,
} from "./remote-control";

export type DeviceAction =
  | {
      type: "touch";
      phase: "down" | "move" | "up" | "cancel";
      x: number;
      y: number;
    }
  | { type: "tap"; x: number; y: number }
  | {
      type: "swipe";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ms: number;
    }
  | {
      type: "key";
      key:
        | "home"
        | "back"
        | "recent"
        | "enter"
        | "del"
        | "volume_up"
        | "volume_down"
        | "power";
    }
  | { type: "text"; text: string };
type RemoteState = {
  connection: "connecting" | "ready" | "paused" | "closed";
  device: DeviceInfo | null;
  width: number;
  height: number;
  viewerId: string;
  control: RemoteControl;
  frame: string;
  error: string;
};
type ServerMessage = {
  type: string;
  device?: DeviceInfo;
  width?: number;
  height?: number;
  viewerId?: string;
  control?: RemoteControl;
  requestId?: string;
  ok?: boolean;
  error?: string;
};

export function useRemoteDevice(serial: string, onAuthExpired: () => void) {
  const [state, setState] = useState<RemoteState>({
    connection: "connecting",
    device: null,
    width: 0,
    height: 0,
    viewerId: "",
    control: { kind: "runner" },
    frame: "",
    error: "",
  });
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const touches = useRef<ReturnType<typeof createTouchInput> | null>(null);
  const pending = useRef<{
    id: string;
    resolve: (ok: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    let closeRenderer = () => {};
    let retry: ReturnType<typeof setTimeout> | undefined;
    let handshake: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    function finishAction(ok: boolean) {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      pending.current.resolve(ok);
      pending.current = null;
      setBusy(false);
    }
    function disconnect() {
      clearTimeout(retry);
      clearTimeout(handshake);
      closeRenderer();
      touches.current?.stop();
      touches.current = null;
      const ws = socket.current;
      socket.current = null;
      ws?.close();
      finishAction(false);
    }
    function connect() {
      if (disposed || socket.current) return;
      setState((previous) => ({
        ...previous,
        connection: "connecting",
        error: "",
      }));
      const url = new URL("/aiqa/studio/ws", location.href);
      url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("device", serial);
      const ws = new WebSocket(url);
      socket.current = ws;
      touches.current = createTouchInput(
        (requestId, action) =>
          ws.send(JSON.stringify({ type: "action", requestId, action })),
        (error) => {
          setState((previous) => ({ ...previous, error }));
          ws.close();
        },
      );
      ws.binaryType = "arraybuffer";
      let videoTimer: ReturnType<typeof setTimeout> | undefined;
      let frameSeen = false;
      let videoSeen = false;
      let drawing = false;
      let latestJpeg: ArrayBuffer | undefined;
      const rendered = () => {
        if (!frameSeen) {
          frameSeen = true;
          setState((previous) => ({ ...previous, frame: "ready" }));
        }
      };
      const renderer = createVideoRenderer(
        () => canvasRef.current,
        () => {
          videoSeen = true;
          clearTimeout(videoTimer);
          rendered();
        },
        (width, height) =>
          setState((previous) => ({ ...previous, width, height })),
        () => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "video", enabled: false }));
        },
      );
      closeRenderer = () => {
        renderer.close();
        clearTimeout(videoTimer);
        latestJpeg = undefined;
      };
      async function drawJpeg() {
        if (drawing) return;
        drawing = true;
        try {
          while (latestJpeg && !disposed && socket.current === ws) {
            const data = latestJpeg;
            latestJpeg = undefined;
            const bitmap = await createImageBitmap(
              new Blob([data], { type: "image/jpeg" }),
            );
            try {
              const target = canvasRef.current;
              if (target && !disposed && socket.current === ws) {
                if (
                  target.width !== bitmap.width ||
                  target.height !== bitmap.height
                ) {
                  target.width = bitmap.width;
                  target.height = bitmap.height;
                }
                target.getContext("2d")?.drawImage(bitmap, 0, 0);
                rendered();
              }
            } finally {
              bitmap.close();
            }
          }
        } catch {
          /* Skip damaged frames. */
        } finally {
          drawing = false;
        }
      }
      handshake = setTimeout(() => {
        if (socket.current !== ws) return;
        setState((previous) => ({
          ...previous,
          error: "기기 연결이 지연되고 있어요. 다시 연결해 주세요.",
        }));
        ws.close();
      }, 15000);
      ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
        if (disposed || socket.current !== ws) return;
        if (event.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(event.data);
          if (bytes[0] === 0x48) renderer.feed(bytes);
          else {
            latestJpeg = event.data;
            void drawJpeg();
          }
          return;
        }
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          if (message.type === "reserved") {
            setState((previous) => ({
              ...previous,
              error: "",
              connection: "connecting",
            }));
          } else if (message.type === "ready") {
            clearTimeout(handshake);
            attempt = 0;
            if (
              message.device?.platform === "android" &&
              typeof VideoDecoder !== "undefined"
            ) {
              ws.send(JSON.stringify({ type: "video", enabled: true }));
              videoTimer = setTimeout(() => {
                if (!videoSeen && ws.readyState === WebSocket.OPEN) {
                  renderer.close();
                  ws.send(JSON.stringify({ type: "video", enabled: false }));
                }
              }, 5000);
            }
            setState((previous) => ({
              ...previous,
              connection: "ready",
              device: message.device || previous.device,
              width: message.width || previous.width,
              height: message.height || previous.height,
              viewerId: message.viewerId || "",
              control: message.control || { kind: "runner" },
              error: "",
            }));
          } else if (message.type === "control" && message.control) {
            const control = message.control;
            setState((previous) => ({ ...previous, control }));
          } else if (
            message.type === "display" &&
            message.width &&
            message.height
          ) {
            setState((previous) => ({
              ...previous,
              width: message.width || previous.width,
              height: message.height || previous.height,
            }));
          } else if (
            message.type === "reply" &&
            message.requestId === pending.current?.id
          ) {
            if (message.error || !message.ok)
              setState((previous) => ({
                ...previous,
                error: message.error || "기기를 조작하지 못했어요.",
              }));
            finishAction(message.ok === true && !message.error);
          } else if (
            message.type === "reply" &&
            message.requestId?.startsWith("touch:")
          ) {
            touches.current?.reply(
              message.requestId,
              message.ok === true,
              message.error,
            );
          } else if (message.type === "error") {
            setState((previous) => ({
              ...previous,
              error: message.error || "기기에 연결하지 못했어요.",
            }));
          }
        } catch {
          setState((previous) => ({
            ...previous,
            error: "기기 응답을 읽지 못했어요.",
          }));
        }
      };
      ws.onclose = (event) => {
        if (disposed || socket.current !== ws) return;
        clearTimeout(handshake);
        closeRenderer();
        touches.current?.stop();
        touches.current = null;
        socket.current = null;
        finishAction(false);
        setState((previous) => ({
          ...previous,
          connection: "closed",
          error:
            previous.error ||
            "기기에 연결하지 못했어요. 상태를 확인한 뒤 다시 연결해 주세요.",
        }));
        if (event.code === 4401) {
          onAuthExpired();
          return;
        }
        if (!mayRetryRemoteClose(event.code)) return;
        attempt++;
        if (attempt <= 3) retry = setTimeout(connect, attempt * 3000);
      };
    }
    function visibilityChanged() {
      if (!document.hidden) {
        attempt = 0;
        connect();
      }
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", disconnect);
    connect();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", disconnect);
      disconnect();
    };
  }, [serial, revision, onAuthExpired]);

  const canControl = mayControlDevice(
    state.connection === "ready",
    state.control,
    state.viewerId,
  );
  async function action(value: DeviceAction) {
    const ws = socket.current;
    if (
      !canControl ||
      pending.current ||
      !ws ||
      ws.readyState !== WebSocket.OPEN
    )
      return false;
    setBusy(true);
    setState((previous) => ({ ...previous, error: "" }));
    const requestId = crypto.randomUUID();
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        if (pending.current?.id !== requestId) return;
        pending.current = null;
        setBusy(false);
        setState((previous) => ({
          ...previous,
          error: "기기 응답이 늦어요. 화면을 확인해 주세요.",
        }));
        resolve(false);
      }, 15000);
      pending.current = { id: requestId, resolve, timer };
      try {
        ws.send(JSON.stringify({ type: "action", requestId, action: value }));
      } catch {
        clearTimeout(timer);
        pending.current = null;
        setBusy(false);
        setState((previous) => ({
          ...previous,
          error: "기기 연결이 끊겼어요. 다시 연결해 주세요.",
        }));
        resolve(false);
      }
    });
  }
  return {
    ...state,
    canvasRef,
    busy,
    canControl,
    action,
    touch: (value: TouchInput) =>
      canControl &&
      !pending.current &&
      socket.current?.readyState === WebSocket.OPEN &&
      touches.current?.push(value) === true,
    reconnect: () => setRevision((value) => value + 1),
  };
}
