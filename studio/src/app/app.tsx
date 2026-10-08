import { useState } from "react";
import {
  Download,
  RotateCcw,
  Square,
  AlertCircle,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
        onMcp={downloadMcp}
      />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-screen-2xl space-y-6 p-5 md:p-8">
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
