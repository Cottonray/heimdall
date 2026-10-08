import { type ReactNode, useId, useState } from "react";
import {
  Check,
  AlertCircle,
  Image,
  Terminal,
  Braces,
  ListChecks,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { actionLabel } from "@/lib/labels";
import { evidenceUrl } from "@/lib/api";
import type { Session, Step, Action } from "../../../../contracts/studio";
export function DebugPanel({
  session,
  busy,
  onAction,
  agent,
}: {
  agent?: ReactNode;
  session: Session;
  busy: boolean;
  onAction: (a: Action) => Promise<unknown>;
}) {
  const formId = useId();
  const [evidence, setEvidence] = useState<Step | null>(null);
  const [url, setUrl] = useState("http://127.0.0.1:8081/demo/api/accounts");
  const [contains, setContains] = useState("QA 테스트 계좌");
  const [status, setStatus] = useState("200");
  return (
    <Card variant="panel">
      <CardContent variant="compact">
        <Tabs defaultValue={agent ? "agent" : "timeline"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="flex flex-wrap h-auto">
              {agent && <TabsTrigger value="agent">AI 시나리오</TabsTrigger>}
              <TabsTrigger value="timeline">
                <ListChecks className="size-4" />
                실행 기록
              </TabsTrigger>
              <TabsTrigger value="debug">
                <Terminal className="size-4" />
                디버깅
              </TabsTrigger>
              <TabsTrigger value="api">
                <Braces className="size-4" />
                API
              </TabsTrigger>
            </TabsList>
            <span className="text-xs text-muted-foreground">
              {session.steps.length}단계 ·{" "}
              {session.steps.filter((s) => s.actor === "Human").length}개 직접
              조작
            </span>
          </div>
          {agent && <TabsContent value="agent">{agent}</TabsContent>}
          <TabsContent value="timeline">
            <div className="overflow-auto">
              {session.steps.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  첫 번째 동작을 기다리고 있어요.
                </p>
              ) : (
                session.steps.map((step) => {
                  const a = actionLabel(step.action);
                  return (
                    <div
                      key={step.n}
                      className="flex items-start gap-3 border-b py-4 last:border-b-0"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                        {step.n}
                      </span>
                      <div data-selectable className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{a.verb}</p>
                          <Badge variant="secondary">{step.actor}</Badge>
                          {step.ok ? (
                            <Check className="size-4 text-success" />
                          ) : (
                            <AlertCircle className="size-4 text-destructive" />
                          )}
                        </div>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {a.target}
                          {a.value ? " → " + a.value : ""}
                        </p>
                        {step.error && (
                          <p className="mt-2 break-all text-xs text-destructive">
                            {step.error}
                          </p>
                        )}
                      </div>
                      <span className="pt-1 text-xs tabular-nums text-muted-foreground">
                        {(step.ms / 1000).toFixed(1)}s
                      </span>
                      {step.evidence && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={step.n + "단계 증적"}
                          onClick={() => setEvidence(step)}
                        >
                          <Image />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
          <TabsContent value="debug">
            <div className="grid gap-4">
              <div>
                <h3 className="my-3 text-sm font-medium">콘솔 · 네트워크</h3>
                <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 text-xs leading-6">
                  {session.observation?.logs?.length
                    ? JSON.stringify(session.observation.logs, null, 2)
                    : "수집된 로그가 없어요."}
                </pre>
              </div>
              <div>
                <h3 className="my-3 text-sm font-medium">화면 요소</h3>
                <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 text-xs leading-6">
                  {typeof session.observation?.tree === "string"
                    ? session.observation.tree
                    : JSON.stringify(session.observation?.tree || [], null, 2)}
                </pre>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="api">
            <form
              className="space-y-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void onAction({
                  type: "api",
                  url,
                  status: Number(status),
                  contains,
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor={formId + "-url"}>GET 요청 주소</Label>
                <Input
                  id={formId + "-url"}
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-28 space-y-2">
                  <Label htmlFor={formId + "-status"}>기대 상태</Label>
                  <Input
                    id={formId + "-status"}
                    type="number"
                    min={100}
                    max={599}
                    required
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor={formId + "-contains"}>응답에 포함될 값</Label>
                  <Input
                    id={formId + "-contains"}
                    value={contains}
                    onChange={(e) => setContains(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    session.state === "ai" ||
                    session.state === "replay" ||
                    session.state === "closed" ||
                    session.engine === "android"
                  }
                >
                  API 검증
                </Button>
              </div>
              {session.engine === "android" && (
                <p className="text-xs text-muted-foreground">
                  API 검증은 웹 또는 API 세션에서 실행해요.
                </p>
              )}
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
      <Dialog
        open={!!evidence}
        onOpenChange={(v) => {
          if (!v) setEvidence(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{evidence?.n}단계 실행 증적</DialogTitle>
            <DialogDescription>
              {evidence?.at} · {evidence?.actor}
            </DialogDescription>
          </DialogHeader>
          {evidence?.evidence && (
            <img
              className="max-h-preview max-w-full object-contain"
              src={evidenceUrl(session.id, evidence.evidence)}
              alt="단계 실행 증적"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
