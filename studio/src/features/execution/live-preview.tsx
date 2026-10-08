import { PreviewSurface } from "@/components/ui/preview-surface";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  RefreshCw,
  Send,
  Monitor,
  MousePointer2,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  const disabled =
    busy ||
    session.working ||
    session.state === "ai" ||
    session.state === "replay" ||
    session.state === "closed";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>
            <span className="flex items-center gap-2">
              <Monitor className="size-4" />
              실행 화면
            </span>
          </CardTitle>
          <Badge variant={session.state === "closed" ? "secondary" : "outline"}>
            {session.state === "closed" ? "마지막 증적" : "LIVE"}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {session.engine === "android"
            ? "Android · 연결된 테스트 기기"
            : session.observation?.url || session.url}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {frame ? (
            <PreviewSurface
              aria-label="테스트 화면 조작"
              disabled={disabled}
              onClick={(e) => {
                const img = e.currentTarget.querySelector("img");
                if (!img) return;
                const r = img.getBoundingClientRect();
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
                className="block max-h-preview max-w-full object-contain"
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
      <CardFooter>
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
                  key: session.engine === "android" ? "Back" : "Alt+ArrowLeft",
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
              disabled={busy || session.state === "closed"}
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
            {session.state === "closed"
              ? "저장된 마지막 화면이에요. 재실행으로 다시 시작할 수 있어요."
              : session.ai
                ? "사람 개입을 누르면 직접 조작할 수 있어요."
                : "화면을 누르면 수행한 단계가 자동으로 기록돼요."}
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}
