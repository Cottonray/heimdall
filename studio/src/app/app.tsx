import { Board } from "@/features/board/board";
import { Profile } from "@/features/auth/profile";
import { Domains } from "@/features/domains/domains";
import { ProjectList } from "@/features/projects/project-list";
import { MoveTestDialog } from "@/features/projects/move-test-dialog";
import { useEffect, useState } from "react";
import { LoginPage } from "@/features/auth/login-page";
import {
  Download,
  RotateCcw,
  Square,
  AlertCircle,
  X,
  Plus,
  LayoutDashboard,
  History,
  Settings as SettingsIcon,
  Monitor,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { useWorkspace } from "@/features/workspace/use-workspace";
import { isPage } from "@/features/workspace/tabs";
import { SessionSidebar } from "@/features/sessions/session-sidebar";
import { SessionHistory } from "@/features/sessions/session-history";
import { NewSessionDialog } from "@/features/sessions/new-session-dialog";
import { Dashboard } from "@/features/dashboard/dashboard";
import { Settings } from "@/features/settings/settings";
import { useTheme } from "@/features/settings/use-theme";
import { LivePreview } from "@/features/execution/live-preview";
import { AgentPanel } from "@/features/agent/agent-panel";
import { DebugPanel } from "@/features/debugging/debug-panel";
import { ExportDialog } from "@/features/scenarios/export-dialog";
import { api } from "@/lib/api";
import { engines } from "@/lib/labels";
import type { Session, SessionExport } from "../../../contracts/studio";

export function App() {
  const w = useWorkspace();
  const { theme, setTheme, toggleTheme } = useTheme();
  const [newOpen, setNewOpen] = useState(false);
  const [exported, setExported] = useState<SessionExport | null>(null);
  useEffect(() => {
    if (w.loading) return;
    if (!w.user) history.replaceState(null, "", "/aiqa/studio/login");
    else if (location.pathname.endsWith("/login"))
      history.replaceState(
        null,
        "",
        "/aiqa/studio/" + (w.selectedId ? "#" + w.selectedId : ""),
      );
  }, [w.user, w.loading, w.selectedId]);
  if (!w.loading && !w.user)
    return (
      <LoginPage
        busy={w.busy}
        error={w.error}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogin={w.store.login}
        onTestLogin={w.store.testLogin}
      />
    );
  const projectSessions = w.sessions.filter(
    (s) => (s.projectId || "default") === w.projectId,
  );
  const projectName =
    w.status?.projects?.find((p) => p.id === w.projectId)?.name ||
    "기본 프로젝트";
  const visibleTabs = w.tabs.filter(
    (id) => isPage(id) || projectSessions.some((s) => s.id === id),
  );
  const onTab = (id: string) =>
    isPage(id) ? w.store.navigate(id) : w.store.select(id);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row">
      {
        <SessionSidebar
          projectName={
            w.activeTab === "projects" || !w.projectId || !w.user
              ? ""
              : projectName
          }
          signedIn={!!w.user}
          active={w.activeTab}
          onNavigate={w.store.navigate}
          onNew={() => setNewOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      }
      <Tabs
        value={w.activeTab}
        onValueChange={onTab}
        className="min-h-0 min-w-0 flex-1"
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-sidebar">
          <TabsList variant="workspace" aria-label="열린 작업">
            {(w.user ? visibleTabs : ["projects"]).map((id) => {
              const label =
                id === "board"
                  ? "워크스페이스"
                  : id === "domains"
                    ? "도메인"
                    : id === "projects"
                      ? "프로젝트"
                      : id === "dashboard"
                        ? "대시보드"
                        : id === "history"
                          ? "테스트 기록"
                          : id === "settings"
                            ? "설정"
                            : w.sessions.find((s) => s.id === id)?.name ||
                              "테스트";
              const Icon =
                id === "projects"
                  ? Folder
                  : id === "dashboard"
                    ? LayoutDashboard
                    : id === "history"
                      ? History
                      : id === "settings"
                        ? SettingsIcon
                        : Monitor;
              return (
                <div key={id} className="flex shrink-0 items-center border-r">
                  <TabsTrigger value={id} title={label}>
                    <Icon />
                    <span className="max-w-40 truncate">{label}</span>
                  </TabsTrigger>
                  {id !== "projects" && id !== "dashboard" && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={label + " 탭 닫기"}
                      onClick={() => w.store.closeTab(id)}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              );
            })}
          </TabsList>
          <div className="px-3 py-2">
            <Profile user={w.user} busy={w.busy} onLogout={w.store.logout} />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {w.error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" />
              <p className="min-w-0 flex-1 break-words">{w.error}</p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="알림 닫기"
                onClick={w.store.clearError}
              >
                <X />
              </Button>
            </div>
          )}
          {w.loading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : !w.user ? (
            <div className="py-12">
              <h1 className="text-3xl font-semibold tracking-tight">
                프로젝트
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                로그인 후 프로젝트를 열 수 있어요.
              </p>
            </div>
          ) : (
            w.tabs.map((id) => {
              const s = w.sessions.find((session) => session.id === id);
              return (
                <TabsContent
                  key={id}
                  value={id}
                  forceMount
                  hidden={w.activeTab !== id}
                >
                  {id === "projects" ? (
                    <ProjectList
                      projects={w.status?.projects || []}
                      busy={w.busy}
                      onEnter={w.store.enterProject}
                      onCreate={async (name) => {
                        await w.store.createProject(name);
                        return !w.store.getSnapshot().error;
                      }}
                    />
                  ) : id === "dashboard" ? (
                    <Dashboard
                      sessions={projectSessions}
                      onNew={() => setNewOpen(true)}
                      onSelect={w.store.select}
                    />
                  ) : id === "history" ? (
                    <SessionHistory
                      sessions={projectSessions}
                      onSelect={w.store.select}
                    />
                  ) : id === "board" ? (
                    <Board
                      key={w.projectId}
                      projectId={w.projectId}
                      sessions={projectSessions}
                      active={w.activeTab === "board"}
                      onSelect={w.store.select}
                    />
                  ) : id === "domains" ? (
                    <Domains
                      domains={w.status?.domains || []}
                      admin={w.user?.role === "admin"}
                      busy={w.busy}
                      error={w.error}
                      onSave={async (d) => {
                        await w.store.saveDomain(d);
                        return !w.store.getSnapshot().error;
                      }}
                      onRemove={async (id) => {
                        await w.store.removeDomain(id);
                        return !w.store.getSnapshot().error;
                      }}
                    />
                  ) : id === "settings" ? (
                    <Settings
                      theme={theme}
                      onTheme={setTheme}
                      status={w.status}
                      onRefresh={() => void w.store.refresh()}
                    />
                  ) : s ? (
                    <div className="space-y-6">
                      <SessionContent
                        w={w}
                        s={s}
                        active={w.activeTab === id}
                        onNew={() => setNewOpen(true)}
                        onExport={setExported}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      테스트 기록을 찾을 수 없어요.
                    </p>
                  )}
                </TabsContent>
              );
            })
          )}
        </main>
      </Tabs>
      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        busy={w.busy}
        domains={w.status?.domains || []}
        onCreate={async (args) => {
          await w.store.open(args);
          if (!w.store.getSnapshot().error) setNewOpen(false);
        }}
      />
      <ExportDialog data={exported} onClose={() => setExported(null)} />
    </div>
  );
}
function SessionContent({
  w,
  s,
  active,
  onNew,
  onExport,
}: {
  w: ReturnType<typeof useWorkspace>;
  s: Session;
  active: boolean;
  onNew: () => void;
  onExport: (data: SessionExport) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {engines[s.engine].label}
            </span>
            <StatusBadge state={s.state} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{s.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <MoveTestDialog
            projects={w.status?.projects || []}
            current={s.projectId || "default"}
            busy={w.busy}
            onMove={async (id) => {
              await w.store.moveSession(s.id, id);
              return !w.store.getSnapshot().error;
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={w.busy}
            onClick={() =>
              void w.store.run(async () =>
                onExport(await api.call("qa_export", { id: s.id })),
              )
            }
          >
            <Download />
            내보내기
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={w.busy}
            onClick={() => void w.store.command("qa_replay")}
          >
            <RotateCcw />
            재실행
          </Button>
          {s.state !== "closed" && (
            <Button
              variant="ghost"
              size="sm"
              disabled={w.busy}
              onClick={() => void w.store.command("qa_close")}
            >
              <Square />
              종료
            </Button>
          )}
          <Button size="sm" onClick={() => onNew()}>
            <Plus />새 테스트
          </Button>
        </div>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <LivePreview
            session={s}
            frame={active ? w.frame : ""}
            busy={w.busy}
            onAction={w.store.action}
            onRefresh={() => w.store.command("qa_observe")}
          />
        </div>
        <AgentPanel
          key={s.id}
          session={s}
          busy={w.busy}
          onCommand={w.store.command}
          onAction={w.store.action}
        />
      </div>
      <DebugPanel
        key={"debug-" + s.id}
        session={s}
        busy={w.busy}
        onAction={w.store.action}
      />
    </>
  );
}
