import { AppLibrary } from "@/features/apps/app-library";
import { ErrorToast } from "@/components/error-toast";
import { Tabs, PanelTabsList, TabsContent } from "@/components/ui/tabs";
import { PanelResizeHandle } from "@/components/ui/panel-resize-handle";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft,
  Delete,
  Home,
  Monitor,
  Send,
  Square,
  Volume2,
  Volume1,
  Power,
  LockKeyhole,
  Camera,
  Video,
  X,
} from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TouchIndicator } from "@/components/ui/touch-indicator";
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
    remote.viewerId,
  );
  const [text, setText] = useState("");
  const imageRef = remote.canvasRef;
  const capture = useScreenCapture(imageRef, remote.connection === "ready");
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    heartbeat: ReturnType<typeof setInterval>;
  } | null>(null);
  const [touchMark, setTouchMark] = useState<{
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  function mark(x: number, y: number, active: boolean) {
    setTouchMark({
      x: (100 * x) / remote.width,
      y: (100 * y) / remote.height,
      active,
    });
  }
  function endTouch(phase: "up" | "cancel", end?: { x: number; y: number }) {
    const held = gesture.current;
    gesture.current = null;
    if (!held) return;
    clearInterval(held.heartbeat);
    const point = end || held;
    remote.touch({ type: "touch", phase, x: point.x, y: point.y });
    mark(point.x, point.y, false);
  }
  useEffect(() => {
    const cancel = () => endTouch("cancel");
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  });
  useEffect(
    () => () => {
      if (gesture.current) clearInterval(gesture.current.heartbeat);
    },
    [],
  );
  const [toolTab, setToolTab] = useState("web");
  const ios = remote.device?.platform === "ios";
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
        width: remote.width || image.width,
        height: remote.height || image.height,
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
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-background px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <PlatformIcon
              platform={
                remote.device?.platform ||
                (serial.startsWith("ios:") ? "ios" : "android")
              }
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold" title={serial}>
              {name}
            </h1>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <StatusDot state={remote.connection} label={status} />
              <span>{status}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={remote.reconnect}>
            재연결
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
      <ErrorToast message={remote.error || capture.error || undefined} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
            {remote.connection === "ready" ? (
              <PreviewSurface
                variant="remote"
                aria-label="기기 화면 조작. 누르거나 밀어서 조작"
                disabled={disabled}
                onPointerDown={(event) => {
                  if (event.button !== 0 || gesture.current) return;
                  const start = point(event);
                  if (
                    !start ||
                    !remote.touch({ type: "touch", phase: "down", ...start })
                  )
                    return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  gesture.current = {
                    ...start,
                    pointerId: event.pointerId,
                    heartbeat: setInterval(() => {
                      const held = gesture.current;
                      if (held)
                        remote.touch({
                          type: "touch",
                          phase: "move",
                          x: held.x,
                          y: held.y,
                        });
                    }, 1000),
                  };
                  mark(start.x, start.y, true);
                }}
                onPointerMove={(event) => {
                  const held = gesture.current;
                  if (!held || held.pointerId !== event.pointerId) return;
                  const next = point(event, true);
                  if (!next) return;
                  held.x = next.x;
                  held.y = next.y;
                  remote.touch({ type: "touch", phase: "move", ...next });
                  mark(next.x, next.y, true);
                }}
                onPointerUp={(event) => {
                  if (gesture.current?.pointerId !== event.pointerId) return;
                  endTouch("up", point(event, true) || undefined);
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => endTouch("cancel")}
                onLostPointerCapture={() => endTouch("cancel")}
                onClick={(event) => {
                  if (event.detail === 0 && remote.width && remote.height)
                    void remote.action({
                      type: "tap",
                      x: Math.floor(remote.width / 2),
                      y: Math.floor(remote.height / 2),
                    });
                }}
              >
                <canvas
                  ref={imageRef}
                  aria-label={`${name} 화면`}
                  className="block h-full w-auto max-w-full object-contain"
                />
                {touchMark && <TouchIndicator {...touchMark} />}
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
              {!ios && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="뒤로"
                  disabled={disabled}
                  onClick={() =>
                    void remote.action({ type: "key", key: "back" })
                  }
                >
                  <ArrowLeft />
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                aria-label="홈"
                disabled={disabled}
                onClick={() => void remote.action({ type: "key", key: "home" })}
              >
                <Home />
              </Button>
              {!ios && (
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
              )}
              {(
                [
                  { key: "volume_down", label: "볼륨 감소", Icon: Volume1 },
                  { key: "volume_up", label: "볼륨 증가", Icon: Volume2 },
                  {
                    key: "power",
                    label: "화면 잠금 / 깨우기",
                    Icon: ios ? LockKeyhole : Power,
                  },
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
                aria-label={capture.recording ? "녹화 종료" : "녹화 시작"}
                title={
                  capture.recording
                    ? "녹화 종료 · 최대 3분 · 소리 제외"
                    : "녹화 시작 · 최대 3분 · 소리 제외"
                }
                disabled={!remote.frame && !capture.recording}
                onClick={capture.recording ? capture.stop : capture.start}
              >
                <Video />
                {capture.recording ? "정지" : "녹화"}
              </Button>
              {capture.recording && (
                <span role="status" className="sr-only">
                  녹화 중 · 최대 3분 · 소리 제외
                </span>
              )}
            </div>

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
          className="flex min-h-0 min-w-0 w-3/5 flex-col"
        >
          <Tabs
            value={toolTab}
            onValueChange={setToolTab}
            variant="flush"
            className="min-h-0 flex-1"
          >
            <PanelTabsList
              value={toolTab}
              label="기기 도구"
              items={[
                { value: "web", label: "웹 디버깅", icon: <Monitor /> },
                { value: "apps", label: "앱 설치", icon: <Monitor /> },
              ]}
            />
            <TabsContent
              forceMount
              value="web"
              className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
            >
              <WebViewDebugging
                serial={serial}
                viewerId={remote.viewerId}
                canControl={remote.canControl}
                discovery={webviews}
              />
            </TabsContent>
            <TabsContent
              forceMount
              value="apps"
              className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
            >
              <AppLibrary
                serial={serial}
                viewerId={remote.viewerId || ""}
                canControl={remote.canControl}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </main>
  );
}
