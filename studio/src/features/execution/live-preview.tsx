import { PreviewSurface } from "@/components/ui/preview-surface";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  RefreshCw,
  Send,
  Monitor,
  MousePointer2,
} from "@/components/ui/material-icons";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Session, Action } from "../../../../contracts/studio";
export function LivePreview({
  session,
  frame,
  busy,
  onAction,
  onRefresh,
}: {
  session: Session;
  frame: string;
  busy: boolean;
  onAction: (a: Action) => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
}) {
  const [value, setValue] = useState("");
  const currentUrl = session.observation?.url || session.url;
  const [address, setAddress] = useState<{
    source: string;
    value: string;
  } | null>(null);
  const addressValue =
    address?.source === currentUrl ? address.value : currentUrl;
  const disabled =
    busy ||
    session.working ||
    session.state === "ai" ||
    session.state === "replay" ||
    session.state === "closed";
  return (
    <Card variant="preview" className="h-full">
      <CardHeader variant="compact">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>
            <span className="flex items-center gap-2">
              <Monitor className="size-4" />
              실행 화면
            </span>
          </CardTitle>
        </div>
        {session.engine !== "android" && (
          <form
            className="flex min-w-0 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && addressValue.trim()) {
                void onAction({ type: "goto", url: addressValue.trim() }).then(
                  () => setAddress(null),
                );
              }
            }}
          >
            <Input
              aria-label="테스트 페이지 주소"
              type="url"
              required
              value={addressValue}
              readOnly={disabled}
              onChange={(event) =>
                setAddress({ source: currentUrl, value: event.target.value })
              }
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              aria-label="주소로 이동"
              disabled={disabled || !addressValue.trim()}
            >
              <ArrowRight />
            </Button>
          </form>
        )}
      </CardHeader>
      <CardContent variant="compact" className="min-h-0 flex-1">
        <div className="flex h-full min-h-48 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {frame ? (
            <PreviewSurface
              variant="remote"
              aria-label="테스트 화면 조작"
              disabled={disabled}
              onClick={(e) => {
                const img = e.currentTarget.querySelector("img");
                if (!img) return;
                const r = img.getBoundingClientRect();
                if (
                  e.clientX < r.left ||
                  e.clientX > r.right ||
                  e.clientY < r.top ||
                  e.clientY > r.bottom
                )
                  return;
                const x = Math.round(
                  ((e.clientX - r.left) / r.width) *
                    (session.engine === "android"
                      ? session.observation?.width || img.naturalWidth
                      : img.naturalWidth),
                );
                const y = Math.round(
                  ((e.clientY - r.top) / r.height) *
                    (session.engine === "android"
                      ? session.observation?.height || img.naturalHeight
                      : img.naturalHeight),
                );
                void onAction({ type: "point", x, y });
              }}
            >
              <img
                src={frame}
                alt="테스트 대상 화면"
                className="block h-full max-h-full max-w-full object-contain"
              />
            </PreviewSurface>
          ) : (
            <div className="space-y-3 p-12 text-center text-muted-foreground">
              <Monitor className="mx-auto size-8" />
              <p className="text-sm">
                {session.state === "closed"
                  ? "저장된 화면이 없어요"
                  : "화면을 연결하고 있어요"}
              </p>
            </div>
          )}
        </div>
      </CardContent>
      {session.state !== "closed" && (
        <CardFooter variant="compact">
          <div className="w-full space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="뒤로"
                disabled={disabled}
                onClick={() =>
                  void onAction({
                    type: "key",
                    key:
                      session.engine === "android" ? "Back" : "Alt+ArrowLeft",
                  })
                }
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="아래로 스크롤"
                disabled={disabled}
                onClick={() =>
                  void onAction({ type: "scroll", direction: "down" })
                }
              >
                <ArrowDown />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="화면 새로고침"
                disabled={busy}
                onClick={() => void onRefresh()}
              >
                <RefreshCw />
              </Button>
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (value) void onAction({ type: "type", value });
                }}
              >
                <Input
                  aria-label="선택한 입력칸에 넣을 내용"
                  placeholder="선택한 입력칸에 입력"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={disabled}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="입력"
                  type="submit"
                  disabled={disabled || !value}
                >
                  <Send />
                </Button>
              </form>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <MousePointer2 className="size-3" />
              {session.ai
                ? "사람 개입을 누르면 직접 조작할 수 있어요."
                : "화면을 누르면 수행한 단계가 자동으로 기록돼요."}
            </p>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
