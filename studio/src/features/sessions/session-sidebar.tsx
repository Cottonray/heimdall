import logo from "@/assets/heimdall.png";
import { Sun, Moon } from "lucide-react";
import { useState, useId } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Brain, MessageSquare } from "lucide-react";
import {
  Users,
  Play,
  Settings2,
  Database,
  ListChecks,
  Folder,
  Smartphone,
} from "lucide-react";
import { ArrowLeft, LayoutDashboard, History, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeimdallWordmark } from "@/components/heimdall-wordmark";
import type { Page } from "@/features/workspace/tabs";
import { ThemeControls } from "@/features/settings/theme-controls";
import type { Theme } from "@/features/settings/use-theme";
export function SessionSidebar({
  projectName,
  signedIn,
  admin,
  active,
  onNavigate,
  theme,
  onTheme,
}: {
  projectName: string;
  signedIn: boolean;
  admin: boolean;
  active: string;
  onNavigate: (page: Page) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}) {
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("heimdall.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });
  return (
    <aside
      className={
        "flex shrink-0 flex-col border-b bg-sidebar text-sidebar-foreground md:border-b-0 md:border-r overflow-hidden transition-[width] duration-200 ease-in-out motion-reduce:transition-none " +
        (collapsed ? "md:w-16" : "md:w-56")
      }
    >
      <div
        className={
          "flex items-center justify-end gap-2 " +
          (collapsed ? "flex-col p-2" : "p-3")
        }
      >
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="heimdall 기본 페이지"
            onClick={() => onNavigate("projects")}
          >
            <img src={logo} alt="" className="size-8 object-contain" />
          </Button>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="brand"
            type="button"
            aria-label="heimdall 기본 페이지"
            onClick={() => onNavigate("projects")}
            className="min-w-0 justify-start"
          >
            <HeimdallWordmark />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={collapsed ? "size-8 shrink-0" : "ml-auto size-8 shrink-0"}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            try {
              localStorage.setItem("heimdall.sidebar.collapsed", String(next));
            } catch { /* The in-memory toggle still works when storage is unavailable. */ }
          }}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
      {collapsed && (
        <nav
          aria-label="간략 메뉴"
          className="flex flex-1 flex-col items-center gap-1 px-2 pb-3"
        >
          {(projectName
            ? [
                { page: "projects", label: "프로젝트 목록", icon: ArrowLeft },
                {
                  page: "project-settings",
                  label: projectName + " 프로젝트 설정",
                  icon: Settings,
                },
                { page: "dashboard", label: "대시보드", icon: LayoutDashboard },
                { page: "test-data", label: "테스트데이터", icon: Database },
                { page: "scenarios", label: "시나리오", icon: ListChecks },
                { page: "execution", label: "테스트 실행", icon: Play },
                { page: "history", label: "테스트 기록", icon: History },
              ]
            : [
                { page: "projects", label: "프로젝트", icon: Folder },
                { page: "devices", label: "디바이스팜", icon: Smartphone },
                { page: "community", label: "커뮤니티", icon: MessageSquare },
                ...(admin
                  ? [
                      { page: "ai-models", label: "AI 모델 관리", icon: Brain },
                      { page: "app-admin", label: "앱 관리", icon: Folder },
                      {
                        page: "device-admin",
                        label: "기기관리",
                        icon: Settings2,
                      },
                      { page: "user-admin", label: "사용자 관리", icon: Users },
                    ]
                  : []),
              ]
          ).map(({ page, label, icon: Icon }) => (
            <Button
              key={page}
              size="icon"
              variant={active === page ? "secondary" : "ghost"}
              aria-label={label}
              title={label}
              aria-current={active === page ? "page" : undefined}
              onClick={() => onNavigate(page as Page)}
            >
              <Icon />
            </Button>
          ))}
          <Button
            className="mt-auto"
            size="icon"
            variant="ghost"
            aria-label="화면 테마 전환"
            title="화면 테마 전환"
            onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Moon /> : <Sun />}
          </Button>
        </nav>
      )}
      <div
        id={contentId}
        hidden={collapsed}
        className={
          collapsed ? "hidden" : "flex min-h-0 flex-1 flex-col overflow-y-auto"
        }
      >
        {signedIn && !projectName && (
          <nav
            aria-label="전체 메뉴"
            className="flex flex-wrap gap-1 px-3 pb-3 md:flex-1 md:flex-col"
          >
            <Button
              variant={active === "projects" ? "secondary" : "ghost"}
              aria-current={active === "projects" ? "page" : undefined}
              onClick={() => onNavigate("projects")}
              className="justify-start"
            >
              <Folder />
              프로젝트
            </Button>
            <Button
              variant={active === "devices" ? "secondary" : "ghost"}
              aria-current={active === "devices" ? "page" : undefined}
              onClick={() => onNavigate("devices")}
              className="justify-start"
            >
              <Smartphone />
              디바이스팜
            </Button>
            <Button
              variant={active === "community" ? "secondary" : "ghost"}
              aria-current={active === "community" ? "page" : undefined}
              onClick={() => onNavigate("community")}
              className="justify-start"
            >
              <MessageSquare />
              커뮤니티
            </Button>
            {admin && (
              <div
                role="group"
                aria-label="관리자 메뉴"
                className="mt-3 flex w-full flex-wrap gap-1 border-t pt-3 md:flex-col"
              >
                <p className="w-full px-3 pb-1 text-xs font-medium text-muted-foreground">
                  관리자
                </p>
                <Button
                  variant={active === "ai-models" ? "secondary" : "ghost"}
                  onClick={() => onNavigate("ai-models")}
                  className="justify-start"
                >
                  <Brain />
                  AI 모델 관리
                </Button>
                <Button
                  variant={active === "app-admin" ? "secondary" : "ghost"}
                  onClick={() => onNavigate("app-admin")}
                  className="justify-start"
                >
                  <Settings2 />앱 관리
                </Button>
                <Button
                  variant={active === "device-admin" ? "secondary" : "ghost"}
                  onClick={() => onNavigate("device-admin")}
                  className="justify-start"
                >
                  <Settings2 />
                  기기관리
                </Button>
                <Button
                  variant={active === "user-admin" ? "secondary" : "ghost"}
                  onClick={() => onNavigate("user-admin")}
                  className="justify-start"
                >
                  <Users />
                  사용자 관리
                </Button>
              </div>
            )}
          </nav>
        )}
        {signedIn && projectName && (
          <>
            <div className="space-y-2 px-3 pb-3">
              <Button
                variant="ghost"
                onClick={() => onNavigate("projects")}
                className="w-full justify-start"
              >
                <ArrowLeft />
                프로젝트 목록
              </Button>
              <Button
                variant="outline"
                onClick={() => onNavigate("project-settings")}
                aria-label={projectName + " 프로젝트 설정"}
                className="w-full min-w-0 justify-between"
              >
                <span className="truncate">{projectName}</span>
                <Settings />
              </Button>
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
              {/* 워크스페이스 메뉴 임시 숨김: 기능과 저장 데이터는 유지해요. */}
              <Button
                variant={active === "test-data" ? "secondary" : "ghost"}
                onClick={() => onNavigate("test-data")}
                className="justify-start"
              >
                <Database />
                테스트데이터
              </Button>
              <Button
                variant={active === "scenarios" ? "secondary" : "ghost"}
                onClick={() => onNavigate("scenarios")}
                className="justify-start"
              >
                <ListChecks />
                시나리오
              </Button>
              <Button
                variant={active === "execution" ? "secondary" : "ghost"}
                aria-current={active === "execution" ? "page" : undefined}
                onClick={() => onNavigate("execution")}
                className="justify-start"
              >
                <Play />
                테스트 실행
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
        <div className="mt-auto flex flex-wrap items-center gap-1 border-t px-3 py-3 md:flex-col md:items-stretch">
          <ThemeControls theme={theme} onTheme={onTheme} />
        </div>
      </div>
    </aside>
  );
}
