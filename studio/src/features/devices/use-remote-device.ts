import { useEffect, useRef, useState } from "react";
import type { DeviceInfo } from "../../../../contracts/studio";
import {
  mayControlDevice,
  mayRetryRemoteClose,
  type RemoteControl,
} from "./remote-control";

export type DeviceAction =
  | { type: "tap"; x: number; y: number }
  | {
      type: "swipe";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ms: number;
    }
  | { type: "key"; key: "home" | "back" | "recent" | "enter" | "del" }
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
  const socket = useRef<WebSocket | null>(null);
  const pending = useRef<{
    id: string;
    resolve: (ok: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
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
      handshake = setTimeout(() => {
        if (socket.current !== ws) return;
        setState((previous) => ({
          ...previous,
          error: "기기 연결이 지연되고 있어요. 다시 연결해 주세요.",
        }));
        ws.close();
      }, 15000);
      ws.onmessage = (event: MessageEvent<Blob | string>) => {
        if (disposed || socket.current !== ws) return;
        if (event.data instanceof Blob) {
          const previousUrl = objectUrl;
          objectUrl = URL.createObjectURL(event.data);
          const nextUrl = objectUrl;
          setState((previous) => ({ ...previous, frame: nextUrl }));
          if (previousUrl) URL.revokeObjectURL(previousUrl);
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
    busy,
    canControl,
    action,
    reconnect: () => setRevision((value) => value + 1),
  };
}
