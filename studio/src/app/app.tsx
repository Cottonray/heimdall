import { AppLibrary } from "@/features/apps/app-library";
import { PanelResizeHandle } from "@/components/ui/panel-resize-handle";
import { AiModelAdmin } from "@/features/auth/ai-model-admin";
import { Community } from "@/features/community/community";
import { SortableTabsList } from "@/components/ui/sortable-tabs-list";
import { UserAdmin } from "@/features/auth/user-admin";
import { ProjectTestData } from "@/features/projects/test-data";
import { ScenarioList } from "@/features/scenarios/scenario-list";
import { NotificationInbox } from "@/features/auth/notification-inbox";
import { ProjectSettings } from "@/features/projects/project-settings";
import { DeviceFarm } from "@/features/devices/device-farm";
import { RemoteDevice } from "@/features/devices/remote-device";
import { Board } from "@/features/board/board";
import { Profile } from "@/features/auth/profile";
import { Domains } from "@/features/domains/domains";
import { ProjectHome } from "@/features/projects/project-home";
import { MoveTestDialog } from "@/features/projects/move-test-dialog";
import { useEffect, useRef, useState } from "react";
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
import { Tabs, TabsContent, WorkspaceTab } from "@/components/ui/tabs";
import { useWorkspace } from "@/features/workspace/use-workspace";
import { isPage } from "@/features/workspace/tabs";
import { SessionSidebar } from "@/features/sessions/session-sidebar";
import { SessionHistory } from "@/features/sessions/session-history";
import { TestExecution } from "@/features/sessions/test-execution";
import { Dashboard } from "@/features/dashboard/dashboard";
import { Settings } from "@/features/settings/settings";
import { useTheme } from "@/features/settings/use-theme";
import { LivePreview } from "@/features/execution/live-preview";
import { AgentPanel } from "@/features/agent/agent-panel";
import { DebugPanel } from "@/features/debugging/debug-panel";
import { ExportDialog } from "@/features/scenarios/export-dialog";
import { api } from "@/lib/api";
import { APP_ROOT, LOGIN_PATH } from "@/lib/paths";
import type { Session, SessionExport } from "../../../contracts/studio";

export function App() {
  const w = useWorkspace();
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exported, setExported] = useState<SessionExport | null>(null);
  const [remoteDevice] = useState(
    () => new URLSearchParams(location.search).get("device") || "",
  );
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [w.activeTab]);
  useEffect(() => {
    if (w.loading) return;
    const deviceQuery = remoteDevice
      ? "?" + new URLSearchParams({ device: remoteDevice })
      : "";
    if (!w.user)
      history.replaceState(
        null,
        "",
        LOGIN_PATH + (location.search || deviceQuery) + location.hash,
      );
    else if (location.pathname.endsWith("/login"))
      history.replaceState(
        null,
        "",
        APP_ROOT +
          (location.search || deviceQuery) +
          (w.selectedId ? "#" + w.selectedId : ""),
      );
  }, [w.user, w.loading, w.selectedId, remoteDevice]);
  if (!w.loading && !w.user)
    return (
      <LoginPage
        busy={w.busy}
        error={w.error}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
        onLogin={w.store.login}
        onTestLogin={w.store.testLogin}
      />
    );
  if (w.user && remoteDevice)
    return (
      <RemoteDevice serial={remoteDevice} onAuthExpired={w.store.refresh} />
    );
  const projectSessions = w.sessions.filter(
    (s) => (s.projectId || "default") === w.projectId,
  );
  const projectName =
    w.status?.projects?.find((p) => p.id === w.projectId)?.name ||
    "기본 프로젝트";
  const visibleTabs = w.tabs.filter(
    (id) =>
      id !== "community" &&
      id !== "ai-models" &&
      id !== "settings" &&
      id !== "projects" &&
      id !== "devices" &&
      id !== "device-admin" &&
      id !== "app-admin" &&
      id !== "user-admin" &&
      (isPage(id) || projectSessions.some((s) => s.id === id)),
  );
  const onTab = (id: string) =>
    isPage(id) ? w.store.navigate(id) : w.store.select(id);
  const workspaceVisible =
    ![
      "projects",
      "devices",
      "community",
      "device-admin",
      "user-admin",
      "ai-models",
      "app-admin",
    ].includes(w.activeTab) && !!w.projectId;
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row">
      {w.user && (
        <SessionSidebar
          projectName={!workspaceVisible ? "" : projectName}
          signedIn={!!w.user}
          admin={w.user?.role === "admin"}
          active={w.activeTab}
          onNavigate={w.store.navigate}
          theme={theme}
          onTheme={setTheme}
        />
      )}
      <Tabs
        value={w.activeTab}
        onValueChange={onTab}
        className="min-h-0 min-w-0 flex-1"
      >
        {w.user && (
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-sidebar">
            {workspaceVisible && (
              <SortableTabsList order={visibleTabs} onMove={w.store.moveTab}>
                {(w.user ? visibleTabs : ["projects"]).map((id) => {
                  const label =
                    id === "ai-models"
                      ? "AI 모델 관리"
                      : id === "community"
                        ? "커뮤니티"
                        : id === "execution"
                          ? "테스트 실행"
                          : id === "device-admin"
                            ? "기기관리"
                            : id === "user-admin"
                              ? "사용자 관리"
                              : id === "test-data"
                                ? "테스트데이터"
                                : id === "scenarios"
                                  ? "시나리오"
                                  : id === "board"
                                    ? "워크스페이스"
                                    : id === "domains"
                                      ? "도메인"
                                      : id === "projects"
                                        ? "프로젝트"
                                        : id === "dashboard"
                                          ? "대시보드"
                                          : id === "history"
                                            ? "테스트 기록"
                                            : id === "settings" ||
                                                id === "project-settings"
                                              ? id === "settings"
                                                ? "설정"
                                                : "프로젝트 설정"
                                              : w.sessions.find(
                                                  (s) => s.id === id,
                                                )?.name || "테스트";
                  const Icon =
                    id === "projects"
                      ? Folder
                      : id === "dashboard"
                        ? LayoutDashboard
                        : id === "history"
                          ? History
                          : id === "settings" || id === "project-settings"
                            ? SettingsIcon
                            : Monitor;
                  return (
                    <WorkspaceTab
                      key={id}
                      reorderable={id !== "dashboard"}
                      value={id}
                      label={label}
                      icon={<Icon />}
                      active={w.activeTab === id}
                      onClose={
                        id !== "projects" && id !== "dashboard"
                          ? () => w.store.closeTab(id)
                          : undefined
                      }
                    />
                  );
                })}
              </SortableTabsList>
            )}
            <div className="ml-auto flex items-center gap-1 px-3 py-2">
              {w.user && (
                <NotificationInbox key={w.user.id} userId={w.user.id} />
              )}
              <Profile
                user={w.user}
                busy={w.busy}
                onLogout={w.store.logout}
                onSettings={() => setSettingsOpen(true)}
              />
            </div>
          </header>
        )}
        <main
          ref={mainRef}
          className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
        >
          {w.error && (
            <div
              role="alert"
              className="mb-4 flex min-h-12 items-center gap-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle
                aria-hidden="true"
                className="size-4 shrink-0 text-destructive"
              />
              <p className="min-w-0 flex-1 break-words leading-5">{w.error}</p>
              <Button
                variant="danger-ghost"
                size="icon-sm"
                aria-label="오류 알림 닫기"
                onClick={w.store.clearError}
              >
                <X />
              </Button>
            </div>
          )}
          {w.loading && !w.user ? (
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
                    <ProjectHome
                      status={w.status}
                      busy={w.busy}
                      onEnter={w.store.enterProject}
                      onCreate={async (name) => {
                        await w.store.createProject(name);
                        return !w.store.getSnapshot().error;
                      }}
                    />
                  ) : id === "community" ? (
                    <Community user={w.user!} active={w.activeTab === id} />
                  ) : id === "app-admin" ? (
                    w.user?.role === "admin" ? (
                      <AppLibrary management />
                    ) : (
                      <p>관리자만 이용할 수 있어요.</p>
                    )
                  ) : id === "ai-models" ? (
                    w.user?.role === "admin" ? (
                      <AiModelAdmin />
                    ) : (
                      <p>관리자만 이용할 수 있어요.</p>
                    )
                  ) : id === "user-admin" ? (
                    w.user?.role === "admin" ? (
                      <UserAdmin active={w.activeTab === id} />
                    ) : (
                      <p>관리자만 이용할 수 있어요.</p>
                    )
                  ) : id === "device-admin" ? (
                    w.user?.role === "admin" ? (
                      <DeviceFarm active={w.activeTab === id} management />
                    ) : (
                      <p>관리자만 이용할 수 있어요.</p>
                    )
                  ) : id === "devices" ? (
                    <DeviceFarm active={w.activeTab === "devices"} />
                  ) : id === "dashboard" ? (
                    <Dashboard
                      loading={w.loading}
                      active={w.activeTab === id}
                      sessions={w.status?.sessions || []}
                      onSelect={w.store.select}
                    />
                  ) : id === "execution" ? (
                    <TestExecution
                      key={w.projectId}
                      busy={w.busy}
                      domains={w.status?.domains || []}
                      onCreate={w.store.open}
                    />
                  ) : id === "history" ? (
                    <SessionHistory
                      onDelete={w.store.removeSessions}
                      sessions={projectSessions}
                      onSelect={w.store.select}
                    />
                  ) : id === "test-data" ? (
                    <ProjectTestData
                      key={w.projectId}
                      projectId={w.projectId}
                    />
                  ) : id === "scenarios" ? (
                    <ScenarioList
                      onDelete={w.store.removeSessions}
                      key={w.projectId}
                      sessions={projectSessions}
                      onSelect={w.store.select}
                      onCreate={w.store.open}
                      domains={w.status?.domains || []}
                      busy={w.busy}
                    />
                  ) : id === "board" ? (
                    <Board
                      key={
                        w.projectId +
                        (w.status?.projects.find((p) => p.id === w.projectId)
                          ?.tests === 0
                          ? ":empty"
                          : "")
                      }
                      emptyProject={
                        w.status?.projects.find((p) => p.id === w.projectId)
                          ?.tests === 0
                      }
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
                  ) : id === "project-settings" ? (
                    <div className="space-y-8">
                      <ProjectSettings
                        project={
                          w.status?.projects.find(
                            (p) => p.id === w.projectId,
                          ) || null
                        }
                        busy={w.busy}
                        onSave={async (name) => {
                          await w.store.renameProject(name);
                          return !w.store.getSnapshot().error;
                        }}
                      />
                      <Domains
                        domains={w.status?.domains || []}
                        admin={w.user?.role === "admin"}
                        busy={w.busy}
                        error={w.error}
                        onSave={async (domain) => {
                          await w.store.saveDomain(domain);
                          return !w.store.getSnapshot().error;
                        }}
                        onRemove={async (domainId) => {
                          await w.store.removeDomain(domainId);
                          return !w.store.getSnapshot().error;
                        }}
                      />
                    </div>
                  ) : s ? (
                    <div className="space-y-6">
                      <SessionContent
                        w={w}
                        s={s}
                        active={w.activeTab === id}
                        onNew={() => w.store.navigate("execution")}
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
      {w.user && (
        <Settings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          user={w.user}
          busy={w.busy}
          onSaveAvatar={w.store.saveProfile}
          onChangePassword={w.store.changePassword}
        />
      )}
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
      <div className="flex h-session-panels min-h-120 overflow-hidden border rounded-lg">
        <div className="min-w-0 flex-1 overflow-auto">
          <LivePreview
            session={s}
            frame={active ? w.frame : ""}
            busy={w.busy}
            onAction={w.store.action}
            onRefresh={() => w.store.command("qa_observe")}
          />
        </div>
        <PanelResizeHandle
          targetId={"session-tools-" + s.id}
          label="스튜디오 작업 패널 너비"
          initialWidth={70}
        />
        <aside
          id={"session-tools-" + s.id}
          className="w-7/10 min-w-0 shrink-0 overflow-auto"
        >
          <DebugPanel
            key={"debug-" + s.id}
            session={s}
            busy={w.busy}
            onAction={w.store.action}
            agent={
              <AgentPanel
                key={s.id}
                session={s}
                busy={w.busy}
                onCommand={w.store.command}
                onAction={w.store.action}
              />
            }
          />
        </aside>
      </div>
    </>
  );
}
