import { Globe, PanelsTopLeft } from "lucide-react";
import {
  Plus,
  ArrowLeft,
  LayoutDashboard,
  History,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeimdallWordmark } from "@/components/heimdall-wordmark";
import type { Page } from "@/features/workspace/tabs";
import type { Theme } from "@/features/settings/use-theme";
export function SessionSidebar({
  projectName,
  signedIn,
  active,
  onNavigate,
  onNew,
  theme,
  onToggleTheme,
}: {
  projectName: string;
  signedIn: boolean;
  active: string;
  onNavigate: (page: Page) => void;
  onNew: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <aside className="flex shrink-0 flex-col border-b bg-sidebar text-sidebar-foreground md:w-56 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-4 p-4 md:block md:space-y-6 md:p-5">
        <button
          type="button"
          aria-label="heimdall 기본 페이지"
          onClick={() => onNavigate("projects")}
          className="flex min-w-0 items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HeimdallWordmark />
        </button>
        {signedIn && projectName && (
          <Button onClick={onNew} className="md:w-full">
            <Plus />새 테스트
          </Button>
        )}
      </div>
      {signedIn && projectName && (
        <>
          <div className="px-3 pb-3">
            <Button
              variant="ghost"
              onClick={() => onNavigate("projects")}
              className="w-full justify-start"
            >
              <ArrowLeft />
              프로젝트 목록
            </Button>
            <p className="mt-3 truncate px-3 text-xs font-medium text-muted-foreground">
              {projectName}
            </p>
          </div>
          <nav
            aria-label="워크스페이스 메뉴"
            className="flex flex-wrap gap-1 px-3 pb-3 md:flex-1 md:flex-col"
          >
            <Button
              variant={active === "dashboard" ? "secondary" : "ghost"}
              aria-current={active === "dashboard" ? "page" : undefined}
              onClick={() => onNavigate("dashboard")}
              className="justify-start"
            >
              <LayoutDashboard />
              대시보드
            </Button>
            <Button
              variant={active === "board" ? "secondary" : "ghost"}
              onClick={() => onNavigate("board")}
              className="justify-start"
            >
              <PanelsTopLeft />
              워크스페이스
            </Button>
            <Button
              variant={active === "domains" ? "secondary" : "ghost"}
              onClick={() => onNavigate("domains")}
              className="justify-start"
            >
              <Globe />
              도메인
            </Button>
            <Button
              variant={active === "history" ? "secondary" : "ghost"}
              aria-current={active === "history" ? "page" : undefined}
              onClick={() => onNavigate("history")}
              className="justify-start"
            >
              <History />
              테스트 기록
            </Button>
          </nav>
        </>
      )}
      <div className="mt-auto flex gap-1 border-t px-3 py-3 md:flex-col">
        <Button
          variant="ghost"
          onClick={onToggleTheme}
          className="justify-start"
        >
          {theme === "dark" ? <Sun /> : <Moon />}
          {theme === "dark" ? "라이트 모드" : "다크 모드"}
        </Button>
        {signedIn && (
          <Button
            variant={active === "settings" ? "secondary" : "ghost"}
            aria-current={active === "settings" ? "page" : undefined}
            onClick={() => onNavigate("settings")}
            className="justify-start"
          >
            <Settings />
            설정
          </Button>
        )}
      </div>
    </aside>
  );
}
