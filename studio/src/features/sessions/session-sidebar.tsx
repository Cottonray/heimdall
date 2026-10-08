import { useState } from "react";
import {
  Bot,
  Plus,
  Search,
  Monitor,
  Smartphone,
  Braces,
  ArrowUpRight,
  Sparkles,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { engines, states } from "@/lib/labels";
import type { Session } from "../../../../contracts/studio";
export function SessionSidebar({
  sessions,
  selected,
  onSelect,
  onNew,
  onMcp,
  aiReady,
}: {
  sessions: Session[];
  selected: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onMcp: () => void;
  aiReady: boolean | undefined;
}) {
  const [search, setSearch] = useState("");
  return (
    <aside className="flex border-r bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bot className="size-5" />
        </div>
        <div>
          <p className="font-semibold tracking-tight">AI QA Studio</p>
          <p className="text-xs text-muted-foreground">테스트 워크스페이스</p>
        </div>
      </div>
      <div className="px-4 pb-5">
        <Button onClick={onNew} className="w-full">
          <Plus />새 테스트
        </Button>
      </div>
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <div className="px-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label="테스트 검색"
              placeholder="테스트 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center justify-between px-1 py-5">
            <span className="text-xs font-medium text-muted-foreground">
              테스트 기록
            </span>
            <Badge variant="secondary">{sessions.length}</Badge>
          </div>
        </div>
        <nav
          aria-label="테스트 목록"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4"
        >
          {sessions
            .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
            .map((s) => {
              const Icon =
                s.engine === "android" || s.engine === "mobile-web"
                  ? Smartphone
                  : s.engine === "api"
                    ? Braces
                    : Monitor;
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  aria-current={selected === s.id ? "page" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected === s.id && "bg-accent",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {s.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {engines[s.engine].label} · {states[s.state]}
                    </span>
                  </span>
                  {s.state === "passed" && (
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
                  )}
                </button>
              );
            })}
        </nav>
      </div>
      <div className="space-y-3 p-5 lg:border-t">
        <Button variant="ghost" size="sm" onClick={onMcp}>
          <Plug />
          MCP 연결
        </Button>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
          <Sparkles className="size-4" />
          AI {aiReady ? "사용 가능" : "연결 확인 중"}
        </div>
        <a
          href="https://qa.example/"
          className="hidden items-center justify-between text-xs text-muted-foreground hover:text-foreground lg:flex"
        >
          AI 쇼룸
          <ArrowUpRight className="size-3" />
        </a>
      </div>
    </aside>
  );
}
