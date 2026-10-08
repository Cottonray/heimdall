import { PanelResizeHandle } from "@/components/ui/panel-resize-handle";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft,
  Delete,
  Home,
  Monitor,
  RefreshCw,
  Send,
  Square,
  Volume2,
  Volume1,
  Power,
  Camera,
  Video,
  X,
} from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PreviewSurface } from "@/components/ui/preview-surface";
import { useScreenCapture } from "./use-screen-capture";
import { useRemoteDevice } from "./use-remote-device";
import { devicePoint } from "./remote-coordinates";

import { useWebViews, WebViewDebugging } from "./webview-debugging";

export function RemoteDevice({
  serial,
  onAuthExpired,
}: {
  serial: string;
  onAuthExpired: () => void;
}) {
  const remote = useRemoteDevice(serial, onAuthExpired);
  const webviews = useWebViews(
    serial,
    remote.connection === "ready",
    onAuthExpired,
  );
  const [text, setText] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const capture = useScreenCapture(imageRef, remote.connection === "ready");
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    at: number;
  } | null>(null);
  const disabled = !remote.canControl || remote.busy || !remote.frame;
  const name = remote.device?.model || serial;
  useEffect(() => {
    const previous = document.title;
    document.title = `${name} · heimdall`;
    return () => {
      document.title = previous;
    };
  }, [name]);

  function point(event: PointerEvent<HTMLButtonElement>, clamp = false) {
    const image = imageRef.current;
    if (!image) return null;
    return devicePoint(
      event.clientX,
      event.clientY,
      image.getBoundingClientRect(),
      {
        width: remote.width || image.naturalWidth,
        height: remote.height || image.naturalHeight,
      },
      clamp,
    );
  }
  const status =
    remote.connection === "connecting"
      ? "연결 중"
      : remote.connection === "paused"
        ? "일시 정지"
        : remote.connection === "closed"
          ? "연결 끊김"
          : remote.canControl
            ? "조작 가능"
            : "보기 전용";
  return (
    <main className="flex h-dvh flex-col gap-4 overflow-hidden bg-background p-4 text-foreground">
      <div className="-mx-4 flex shrink-0 items-center justify-between gap-3 border-b px-4 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformIcon platform={remote.device?.platform || "android"} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{name}</h1>
            <p
              data-selectable
              className="truncate text-xs text-muted-foreground"
            >
              {serial}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={remote.canControl ? "success" : "outline"}>
            {status}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="다시 연결"
            onClick={remote.reconnect}
          >
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="창 닫기"
            onClick={() => window.close()}
          >
            <X />
          </Button>
        </div>
      </div>
      {remote.error && (
        <p role="alert" className="shrink-0 text-sm text-destructive">
          {remote.error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
            {remote.frame ? (
              <PreviewSurface
                variant="remote"
                aria-label="기기 화면 조작. 누르거나 밀어서 조작"
                disabled={disabled}
                onPointerDown={(event) => {
                  if (event.button !== 0 || gesture.current) return;
                  const start = point(event);
                  if (!start) return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  gesture.current = {
                    ...start,
                    pointerId: event.pointerId,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    at: performance.now(),
                  };
                }}
                onPointerUp={(event) => {
                  const start = gesture.current;
                  gesture.current = null;
                  if (!start || start.pointerId !== event.pointerId) return;
                  const end = point(event, true);
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  if (!end) return;
                  const ms = Math.round(
                    Math.max(100, Math.min(2000, performance.now() - start.at)),
                  );
                  const moved =
                    Math.hypot(
                      event.clientX - start.clientX,
                      event.clientY - start.clientY,
                    ) >= 8;
                  if (moved || ms >= 500)
                    void remote.action({
                      type: "swipe",
                      x1: start.x,
                      y1: start.y,
                      x2: end.x,
                      y2: end.y,
                      ms,
                    });
                  else void remote.action({ type: "tap", x: end.x, y: end.y });
                }}
                onPointerCancel={() => {
                  gesture.current = null;
                }}
                onLostPointerCapture={() => {
                  gesture.current = null;
                }}
                onClick={(event) => {
                  if (event.detail === 0 && remote.width && remote.height)
                    void remote.action({
                      type: "tap",
                      x: Math.floor(remote.width / 2),
                      y: Math.floor(remote.height / 2),
                    });
                }}
              >
                <img
                  ref={imageRef}
                  src={remote.frame}
                  alt={`${name} 화면`}
                  draggable={false}
                  className="block h-full w-auto max-w-full object-contain"
                />
              </PreviewSurface>
            ) : (
              <div
                role="status"
                className="space-y-3 p-6 text-center text-muted-foreground"
              >
                <Monitor className="mx-auto size-8" />
                <p className="text-sm">
                  {remote.connection === "closed"
                    ? "기기 화면을 불러오지 못했어요."
                    : "기기 화면을 연결하고 있어요."}
                </p>
              </div>
            )}
          </div>
          <div className="shrink-0 space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                aria-label="뒤로"
                disabled={disabled}
                onClick={() => void remote.action({ type: "key", key: "back" })}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="홈"
                disabled={disabled}
                onClick={() => void remote.action({ type: "key", key: "home" })}
              >
                <Home />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="최근 앱"
                disabled={disabled}
                onClick={() =>
                  void remote.action({ type: "key", key: "recent" })
                }
              >
                <Square />
              </Button>
              {(
                [
                  { key: "volume_up", label: "볼륨 높이기", Icon: Volume2 },
                  { key: "volume_down", label: "볼륨 낮추기", Icon: Volume1 },
                  { key: "power", label: "화면 잠금 / 깨우기", Icon: Power },
                ] as const
              ).map(({ key, label, Icon }) => (
                <Button
                  key={key}
                  variant="outline"
                  size="icon"
                  aria-label={label}
                  title={label}
                  disabled={disabled}
                  onClick={() => void remote.action({ type: "key", key })}
                >
                  <Icon />
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                aria-label="한 글자 지우기"
                disabled={disabled}
                onClick={() => void remote.action({ type: "key", key: "del" })}
              >
                <Delete />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                disabled={!remote.frame}
                onClick={capture.capture}
              >
                <Camera />
                캡처
              </Button>
              <Button
                variant={capture.recording ? "destructive" : "outline"}
                disabled={!remote.frame && !capture.recording}
                onClick={capture.recording ? capture.stop : capture.start}
              >
                <Video />
                {capture.recording ? "녹화 종료" : "녹화"}
              </Button>
              {capture.recording && (
                <span role="status" className="text-xs text-muted-foreground">
                  녹화 중 · 최대 3분 · 소리 제외
                </span>
              )}
            </div>
            {capture.error && (
              <p role="alert" className="text-sm text-destructive">
                {capture.error}
              </p>
            )}
            <form
              className="flex items-center gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!text || disabled) return;
                if (await remote.action({ type: "text", text })) setText("");
              }}
            >
              <Input
                aria-label="기기에 입력할 텍스트"
                placeholder="선택한 입력칸에 입력"
                value={text}
                disabled={disabled}
                maxLength={2000}
                onChange={(event) => setText(event.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="텍스트 입력"
                disabled={disabled || !text}
              >
                <Send />
              </Button>
            </form>
            {remote.connection === "ready" && !remote.canControl && (
              <p className="text-center text-xs text-muted-foreground">
                {remote.control.kind === "runner"
                  ? "테스트가 기기를 사용 중이에요."
                  : "다른 창에서 기기를 조작 중이에요."}
              </p>
            )}
          </div>
        </div>
        <PanelResizeHandle targetId="web-debugging" />
        <aside
          id="web-debugging"
          aria-label="웹 디버깅"
          className="flex min-h-0 w-3/5 flex-col gap-3 border-l pl-4"
        >
          <h2 className="font-semibold">웹 디버깅</h2>
          <WebViewDebugging
            serial={serial}
            viewerId={remote.viewerId}
            canControl={remote.canControl}
            discovery={webviews}
          />
        </aside>
      </div>
    </main>
  );
}
