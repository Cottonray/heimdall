import { useEffect, useState } from "react";
import { Code, ListChecks } from "@/components/ui/material-icons";
import { CodeBlock } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, PanelTabsList, TabsContent } from "@/components/ui/tabs";
import { script } from "../../../../server/src/studio/domain/export";
import { Badge } from "@/components/ui/badge";
import { EvidencePreview } from "@/components/ui/evidence-preview";
import { evidenceUrl } from "@/lib/api";
import { runStatus } from "@/lib/labels";

import type { Session } from "../../../../contracts/studio";
export function DebugPanel({ session }: { session: Session }) {
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setSelected(null), [session.id]);
  const activeStep = session.steps.find(step => step.n === selected) || session.steps[0];
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
                <div className="grid min-h-80 grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)] gap-3">
                  <nav aria-label="실행 단계" className="max-h-[65vh] overflow-y-auto border-r pr-3">
                    <ol className="space-y-1">
                      {session.steps.map((step) => (
                        <li key={step.n}>
                          <Button
                            variant={activeStep?.n === step.n ? "secondary" : "ghost"}
                            size="step"
                            aria-pressed={activeStep?.n === step.n}
                            aria-controls={`evidence-${session.id}`}
                            onMouseEnter={() => setSelected(step.n)}
                            onFocus={() => setSelected(step.n)}
                            onClick={() => setSelected(step.n)}
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <Badge variant={step.ok && !step.error ? "secondary" : "destructive"}>
                                {step.ok && !step.error ? "완료" : "실패"}
                              </Badge>
                              <span>{step.n}. {step.action.type}</span>
                            </span>
                            <span className="break-all text-xs text-muted-foreground">
                              {step.action.text || step.action.selector || step.action.url || step.action.key}
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ol>
                  </nav>
                  <section id={`evidence-${session.id}`} aria-label="선택한 단계 증적" className="min-w-0 space-y-3">
                    {activeStep && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{activeStep.n}단계 · {activeStep.action.type} · {activeStep.ms}ms</p>
                        {activeStep.error && <p className="text-sm text-destructive">{activeStep.error}</p>}
                      </div>
                    )}
                    {activeStep?.evidence ? (
                      <EvidencePreview key={`${session.id}-${activeStep.evidence}`} src={evidenceUrl(session.id, activeStep.evidence)} step={activeStep.n} />
                    ) : (
                      <p role="status" className="py-12 text-center text-sm text-muted-foreground">표시할 내용이 없어요.</p>
                    )}
                  </section>
                </div>
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
