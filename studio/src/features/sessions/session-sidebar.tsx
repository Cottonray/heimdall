import { Moon, Sun, Settings } from "lucide-react";
import type { Theme } from "@/features/settings/use-theme";
import { HeimdallLogo } from "@/components/heimdall-logo";
import { useState } from "react";
import { Plus, Search, Monitor, Smartphone, Braces, Plug } from "lucide-react";
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
  theme,
  onToggleTheme,
  onSettings,
}: {
  sessions: Session[];
  selected: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onMcp: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onSettings: () => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <aside className="flex flex-wrap items-center justify-between border-b bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:flex-nowrap lg:items-stretch lg:justify-start lg:border-b-0 lg:border-r">
      <button
        type="button"
        onClick={() => onSelect("")}
        aria-label="heimdall 기본 페이지"
        className="flex items-center gap-3 px-5 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HeimdallLogo />
        <div>
          <p className="font-semibold tracking-tight">heimdall</p>
          <p className="text-xs text-muted-foreground">테스트 워크스페이스</p>
        </div>
      </button>
      <div className="shrink-0 px-4 py-4 lg:pb-5 lg:pt-0">
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
      <div className="flex shrink-0 gap-2 p-3 lg:flex-col lg:border-t lg:p-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "라이트 모드" : "다크 모드"}
          className="justify-start"
        >
          {theme === "dark" ? <Sun /> : <Moon />}
          <span className="hidden lg:inline">
            {theme === "dark" ? "라이트 모드" : "다크 모드"}
          </span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSettings}
          aria-label="설정"
          className="justify-start"
        >
          <Settings />
          <span className="hidden lg:inline">설정</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onMcp}
          className="hidden lg:inline-flex lg:justify-start"
        >
          <Plug />
          MCP 연결
        </Button>
      </div>
    </aside>
  );
}
