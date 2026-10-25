import { useEffect, useState } from "react";
import { Code, ListChecks } from "@/components/ui/material-icons";
import { CodeBlock } from "@/components/ui/code-block";
import { Card } from "@/components/ui/card";
import { Tabs, PanelTabsList, TabsContent } from "@/components/ui/tabs";
import { script } from "../../../../server/src/studio/domain/export";
import { Badge } from "@/components/ui/badge";
import { EvidencePreview } from "@/components/ui/evidence-preview";
import { evidenceUrl } from "@/lib/api";
import { runStatus } from "@/lib/labels";

import type { Session } from "../../../../contracts/studio";
export function DebugPanel({ session }: { session: Session }) {
  const [tab, setTab] = useState("results");
  useEffect(() => {
    if (session.execution?.status === "running") setTab("results");
  }, [session.execution?.started, session.execution?.status]);
  const status = session.execution ? runStatus(session) : "미실행";
  return (
    <Card variant="panel">
      <Tabs variant="flush" value={tab} onValueChange={setTab}>
        <PanelTabsList
          value={tab}
          label="스튜디오 도구"
          items={[
            {
              value: "code",
              label: "코드",
              icon: <Code />,
            },
            { value: "results", label: "실행 결과", icon: <ListChecks /> },
          ]}
        />
        <div className="p-3">
          <TabsContent value="results">
            <div className="space-y-4" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status === "실패" ? "destructive" : status === "통과" ? "success" : "secondary"}>
                  {status}
                </Badge>
                <span className="text-sm">
                  {session.execution
                    ? `${session.steps.length} / ${session.execution.total}단계`
                    : `기록된 동작 ${session.steps.length}개`}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {session.execution
                  ? session.message
                  : session.steps.length
                    ? "실행을 누르면 진행 상황과 단계별 결과가 여기에 표시돼요."
                    : "아직 실행할 동작이 없어요. 코덱스와 화면을 조작해 동작을 기록하면 실행할 수 있어요."}
              </p>
              {session.execution && (
                <ol className="space-y-3">
                  {session.steps.map((step) => (
                    <li key={step.n} className="flex flex-wrap items-start justify-between gap-4 rounded-md border p-3">
                      <div className="min-w-40 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={step.ok && !step.error ? "secondary" : "destructive"}>
                          {step.ok && !step.error ? "완료" : "실패"}
                        </Badge>
                        <span className="text-sm">{step.n}. {step.action.type}</span>
                        <span className="text-xs text-muted-foreground">{step.ms}ms</span>
                      </div>
                      <p className="break-all text-sm">
                        {step.action.text || step.action.selector || step.action.url || step.action.key}
                      </p>
                      {step.error && <p className="text-sm text-destructive">{step.error}</p>}
                      </div>
                      {step.evidence && (
                        <EvidencePreview key={step.evidence} src={evidenceUrl(session.id, step.evidence)} step={step.n} />
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </TabsContent>
          <TabsContent value="code">
            <CodeBlock code={script(session, { stepsOnly: true })} />
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
