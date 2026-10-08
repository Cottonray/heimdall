import { useEffect, useState } from "react";
import {
  Plus,
  GripVertical,
  Maximize2,
  X,
  ArrowLeft,
  ArrowRight,
  MoveHorizontal,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { API, evidenceUrl } from "@/lib/api";
import type { Session } from "../../../../contracts/studio";
type Tile = { id: string; wide: boolean };
type Layout = { columns: number; tiles: Tile[] };
function readLayout(key: string, sessions: Session[]): Layout {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) || "null");
    if (
      data &&
      typeof data === "object" &&
      "columns" in data &&
      "tiles" in data &&
      [2, 4, 6, 8].includes(Number(data.columns)) &&
      Array.isArray(data.tiles)
    ) {
      const ids = new Set<string>();
      const tiles: Tile[] = [];
      for (const item of data.tiles)
        if (item && typeof item.id === "string" && !ids.has(item.id)) {
          ids.add(item.id);
          tiles.push({ id: item.id, wide: item.wide === true });
        }
      return { columns: Number(data.columns), tiles };
    }
  } catch {
    /* Start with recent real tests if no saved layout is readable. */
  }
  return {
    columns: 4,
    tiles: sessions.slice(0, 4).map((s) => ({ id: s.id, wide: false })),
  };
}
function Screen({ session, enabled }: { session: Session; enabled: boolean }) {
  const [frame, setFrame] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const file = [...session.steps].reverse().find((s) => s.evidence)?.evidence;
  const closed = session.state === "closed";
  useEffect(() => {
    if (!enabled || closed) return;
    let stopped = false,
      owned = "";
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const update = async () => {
      try {
        if (!document.hidden) {
          const r = await fetch(
            API + "/frame?id=" + encodeURIComponent(session.id),
            { signal: controller.signal },
          );
          if (!r.ok) throw new Error("frame");
          const blob = await r.blob();
          if (stopped) return;
          const next = URL.createObjectURL(blob);
          setFrame(next);
          setUnavailable(false);
          if (owned) URL.revokeObjectURL(owned);
          owned = next;
        }
      } catch {
        if (!stopped) setUnavailable(true);
      }
      if (!stopped) timer = setTimeout(() => void update(), 2000);
    };
    void update();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      if (owned) URL.revokeObjectURL(owned);
    };
  }, [session.id, closed, enabled]);
  const src = closed ? (file ? evidenceUrl(session.id, file) : "") : frame;
  return (
    <div className="flex h-80 items-center justify-center overflow-hidden bg-muted/40">
      {src ? (
        <img
          src={src}
          alt={session.name + " 실행 화면"}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="space-y-3 text-center text-muted-foreground">
          <Monitor className="mx-auto size-6" />
          <p className="text-xs">
            {closed
              ? "저장된 화면 없음"
              : unavailable
                ? "화면 연결 확인 중"
                : "화면 연결 중"}
          </p>
        </div>
      )}
    </div>
  );
}
export function Board({
  projectId,
  sessions,
  active,
  onSelect,
}: {
  projectId: string;
  sessions: Session[];
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const key = "heimdall.board." + projectId;
  const [layout, setLayout] = useState(() => readLayout(key, sessions));
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      /* Storage can be disabled. */
    }
  }, [key, layout]);
  const move = (id: string, target: number) =>
    setLayout((previous) => {
      const from = previous.tiles.findIndex((t) => t.id === id);
      if (from < 0 || target < 0 || target >= previous.tiles.length)
        return previous;
      const tiles = [...previous.tiles];
      const [tile] = tiles.splice(from, 1);
      tiles.splice(target, 0, tile!);
      return { ...previous, tiles };
    });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            워크스페이스
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {layout.tiles.length}개 화면
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="화면 열 개수">
            {[2, 4, 6, 8].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={layout.columns === n ? "secondary" : "ghost"}
                aria-pressed={layout.columns === n}
                onClick={() => setLayout({ ...layout, columns: n })}
              >
                {n}열
              </Button>
            ))}
          </div>
          <Button onClick={() => setAdding(true)}>
            <Plus />
            화면 추가
          </Button>
        </div>
      </div>
      <ul
        aria-label="테스트 화면 보드"
        className={cn(
          "grid items-start gap-4",
          layout.columns === 2 && "grid-cols-1 sm:grid-cols-2",
          layout.columns === 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
          layout.columns === 6 &&
            "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
          layout.columns === 8 &&
            "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8",
        )}
      >
        {layout.tiles.map((tile, index) => {
          const s = sessions.find((s) => s.id === tile.id);
          return (
            <li
              key={tile.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) move(dragging, index);
                setDragging("");
              }}
              className={cn(
                "min-w-0 overflow-hidden rounded-lg border bg-card",
                tile.wide && "sm:col-span-2",
              )}
            >
              <div className="flex items-center gap-2 border-b p-3">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={(s?.name || "화면") + " 순서 이동"}
                  draggable
                  onDragStart={(e) => {
                    setDragging(tile.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", tile.id);
                  }}
                  onDragEnd={() => setDragging("")}
                >
                  <GripVertical />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  onClick={() => onSelect(tile.id)}
                  className="min-w-0 flex-1 justify-start"
                  title={s?.name}
                >
                  <span className="truncate">{s?.name || "기록 없음"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={(s?.name || "화면") + " 보드에서 제거"}
                  onClick={() =>
                    setLayout({
                      ...layout,
                      tiles: layout.tiles.filter((t) => t.id !== tile.id),
                    })
                  }
                >
                  <X />
                </Button>
              </div>
              {s ? (
                <Screen session={s} enabled={active} />
              ) : (
                <div className="flex h-80 items-center justify-center text-xs text-muted-foreground">
                  불러온 기록에 없는 화면이에요.
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t p-2">
                <Badge
                  variant={s?.state === "closed" ? "secondary" : "outline"}
                >
                  {!s
                    ? "기록 없음"
                    : s.state === "closed"
                      ? "마지막 증적"
                      : "LIVE"}
                </Badge>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="앞으로 이동"
                    disabled={index === 0}
                    onClick={() => move(tile.id, index - 1)}
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="뒤로 이동"
                    disabled={index === layout.tiles.length - 1}
                    onClick={() => move(tile.id, index + 1)}
                  >
                    <ArrowRight />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={tile.wide ? "화면 너비 축소" : "화면 너비 확대"}
                    aria-pressed={tile.wide}
                    onClick={() =>
                      setLayout({
                        ...layout,
                        tiles: layout.tiles.map((t) =>
                          t.id === tile.id ? { ...t, wide: !t.wide } : t,
                        ),
                      })
                    }
                  >
                    <MoveHorizontal />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={(s?.name || "화면") + " 전체 열기"}
                    onClick={() => onSelect(tile.id)}
                  >
                    <Maximize2 />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!layout.tiles.length && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <p className="mb-5 text-sm text-muted-foreground">
            함께 볼 테스트 화면을 추가해 주세요.
          </p>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            화면 추가
          </Button>
        </div>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>화면 추가</DialogTitle>
            <DialogDescription>
              워크스페이스에서 함께 볼 테스트를 선택해 주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {sessions
              .filter((s) => !layout.tiles.some((t) => t.id === s.id))
              .map((s) => (
                <Button
                  key={s.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setLayout({
                      ...layout,
                      tiles: [...layout.tiles, { id: s.id, wide: false }],
                    });
                    setAdding(false);
                  }}
                >
                  <Plus />
                  <span className="truncate">{s.name}</span>
                </Button>
              ))}
            {!sessions.some(
              (s) => !layout.tiles.some((t) => t.id === s.id),
            ) && (
              <p className="py-5 text-center text-sm text-muted-foreground">
                추가할 테스트가 없어요.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
