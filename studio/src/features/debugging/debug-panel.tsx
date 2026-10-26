import { useEffect, useState } from "react";
import { Code, ListChecks } from "@/components/ui/material-icons";
import { CodeBlock } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, PanelTabsList, TabsContent } from "@/components/ui/tabs";
import { script, actionComment } from "../../../../server/src/studio/domain/export";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EvidencePreview } from "@/components/ui/evidence-preview";
import { evidenceUrl } from "@/lib/api";
import { runStatus } from "@/lib/labels";

import type { Session } from "../../../../contracts/studio";
export function DebugPanel({ session, source, latestRun }: { session: Session; source?: Session; latestRun?: Session }) {
  const result = session.execution ? session : latestRun || session;
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setSelected(null), [result.id]);
  const activeStep = result.steps.find(step => step.n === selected) || result.steps[0];
  const [tab, setTab] = useState("code");
  useEffect(() => {
    if (result.execution?.status === "running") setTab("results");
  }, [result.execution?.started, result.execution?.status]);
  const status = result.execution ? runStatus(result) : "미실행";
  return (
    <Card variant="panel" className="h-full min-h-0">
      <Tabs className="min-h-0 flex-1" variant="flush" value={tab} onValueChange={setTab}>
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
        <div className={tab === "code" ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-auto p-3"}>
          <TabsContent value="results" className="h-full">
            <div className="flex h-full min-h-0 flex-col gap-4" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status === "실패" ? "failure" : status === "통과" ? "success" : "secondary"}>
                  {status}
                </Badge>
                <span className="text-sm">
                  {result.execution
                    ? `${result.steps.length} / ${result.execution.total}단계`
                    : `기록된 동작 ${result.steps.length}개`}
                </span>
              </div>
              {result.execution && <Progress value={result.execution.total > 0 ? result.steps.length / result.execution.total * 100 : 0} label="테스트 실행 진행률" />}
              {status !== "통과" && <p className="text-sm text-muted-foreground">
                {result.execution
                  ? result.message
                  : result.steps.length
                    ? "실행을 누르면 진행 상황과 단계별 결과가 여기에 표시돼요."
                    : "아직 실행할 동작이 없어요. AI와 화면을 조작해 동작을 기록하면 실행할 수 있어요."}
              </p>}
              {result.execution && (
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)] gap-3">
                  <nav aria-label="실행 단계" className="min-h-0 overflow-y-auto border-r pr-3">
                    <ol className="space-y-1">
                      {result.steps.map((step) => (
                        <li key={step.n}>
                          <Button
                            variant={activeStep?.n === step.n ? "secondary" : "ghost"}
                            size="step"
                            aria-pressed={activeStep?.n === step.n}
                            aria-controls={`evidence-${result.id}`}
                            onMouseEnter={() => setSelected(step.n)}
                            onFocus={() => setSelected(step.n)}
                            onClick={() => setSelected(step.n)}
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <Badge variant={step.ok && !step.error ? "success" : "failure"}>
                                {step.ok && !step.error ? "정상" : "실패"}
                              </Badge>
                              <span>{step.n}. {step.action.type}</span>
                            </span>
                            <span className="break-all text-xs text-muted-foreground">
                              {actionComment(step.action)}
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ol>
                  </nav>
                  <section id={`evidence-${result.id}`} aria-label="선택한 단계 증적" className="flex min-h-0 min-w-0 flex-col gap-3">
                    {activeStep && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{activeStep.n}단계 · {activeStep.action.type} · {activeStep.ms}ms</p>
                        {activeStep.error && <p className="text-sm text-destructive">{activeStep.error}</p>}
                      </div>
                    )}
                    {activeStep?.targetEvidence || activeStep?.evidence ? (
                      <>
                      {activeStep.targetEvidence && <p className="text-xs text-muted-foreground">조작 직전 · 빨간 박스가 클릭·입력 대상이에요. {activeStep.evidence && <a className="underline" href={evidenceUrl(result.id, activeStep.evidence)} target="_blank" rel="noreferrer">실행 후 화면</a>}</p>}
                      {!activeStep.targetEvidence && <p className="text-xs text-muted-foreground">{activeStep.targetCaptureError || "대상 위치가 기록되지 않은 증적이에요."}</p>}
                      <EvidencePreview fill key={`${result.id}-${activeStep.targetEvidence || activeStep.evidence}`} src={evidenceUrl(result.id, (activeStep.targetEvidence || activeStep.evidence)!)} step={activeStep.n} target={activeStep.targetEvidence ? activeStep.target : undefined} />
                      </>
                    ) : (
                      <p role="status" className="py-12 text-center text-sm text-muted-foreground">표시할 내용이 없어요.</p>
                    )}
                  </section>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="code" className="h-full min-h-0">
            <CodeBlock fill code={script(session, { stepsOnly: true })} />
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
