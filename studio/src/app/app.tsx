import { useState } from "react";
import {
  Monitor,
  Smartphone,
  Sparkles,
  Download,
  RotateCcw,
  Square,
  Plug,
  ChevronRight,
  AlertCircle,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { useWorkspace } from "@/features/workspace/use-workspace";
import { SessionSidebar } from "@/features/sessions/session-sidebar";
import { NewSessionDialog } from "@/features/sessions/new-session-dialog";
import { Welcome } from "@/features/sessions/welcome";
import { LivePreview } from "@/features/execution/live-preview";
import { AgentPanel } from "@/features/agent/agent-panel";
import { DebugPanel } from "@/features/debugging/debug-panel";
import { ExportDialog } from "@/features/scenarios/export-dialog";
import { downloadMcp } from "@/features/integrations/mcp";
import { api } from "@/lib/api";
import { engines } from "@/lib/labels";
import type { SessionExport } from "../../../contracts/studio";
export function App() {
  const w = useWorkspace();
  const [newOpen, setNewOpen] = useState(false);
  const [exported, setExported] = useState<SessionExport | null>(null);
  const s = w.session;
  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <SessionSidebar
        sessions={w.sessions}
        selected={w.selectedId}
        onSelect={w.store.select}
        onNew={() => setNewOpen(true)}
      />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">워크스페이스</span>
            <ChevronRight className="size-3 text-muted-foreground" />
            <span className="font-medium">
              {s ? "테스트 스튜디오" : "시작"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={w.connected ? "success" : "secondary"}>
              {w.connected ? "실시간 연결" : "연결 중"}
            </Badge>
            <Button variant="ghost" size="sm" onClick={downloadMcp}>
              <Plug />
              MCP 연결
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-screen-2xl space-y-6 p-5 md:p-8">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Monitor className="size-4" />
              브라우저{" "}
              <strong className="font-medium text-foreground">
                {w.status?.browser.ok
                  ? (w.status.browser.active ?? 0) +
                    " / " +
                    (w.status.browser.capacity ?? 2)
                  : "연결 확인 중"}
              </strong>
            </span>
            <span className="flex items-center gap-2">
              <Smartphone className="size-4" />
              Android{" "}
              <strong className="font-medium text-foreground">
                {w.status?.android.booted ? "1대 연결" : "준비 중"}
              </strong>
            </span>
            <span className="flex items-center gap-2">
              <Sparkles className="size-4" />
              AI{" "}
              <strong className="font-medium text-foreground">
                {w.status?.llm ? "사용 가능" : "연결 확인 중"}
              </strong>
            </span>
          </div>
          {w.error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
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
          ) : s ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {engines[s.engine].label}
                    </span>
                    <StatusBadge state={s.state} />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {s.name}
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={w.busy}
                    onClick={() =>
                      void w.store.run(async () =>
                        setExported(await api.call("qa_export", { id: s.id })),
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
                  <Button size="sm" onClick={() => setNewOpen(true)}>
                    <Plus />새 테스트
                  </Button>
                </div>
              </div>
              <div className="grid items-start gap-5 xl:grid-cols-3">
                <div className="min-w-0 xl:col-span-2">
                  <LivePreview
                    session={s}
                    frame={w.frame}
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
          ) : (
            <Welcome onNew={() => setNewOpen(true)} />
          )}
          <footer className="flex flex-wrap justify-between gap-2 border-t pt-5 text-xs text-muted-foreground">
            <span>AI QA Studio · 홈서버</span>
            <span>샘플 테스트 환경 · 실제 금융 거래 없음</span>
          </footer>
        </main>
      </div>
      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        busy={w.busy}
        onCreate={async (args) => {
          await w.store.open(args);
          if (!w.store.getSnapshot().error) setNewOpen(false);
        }}
      />
      <ExportDialog data={exported} onClose={() => setExported(null)} />
    </div>
  );
}
