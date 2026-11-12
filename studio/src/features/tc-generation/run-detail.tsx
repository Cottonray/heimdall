import { useEffect, useState } from "react";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { TcRun, TestCase } from "../../../../contracts/studio";
import {
  errorText,
  kindLabel,
  levelLabel,
  originLabel,
  stageLabel,
  stages,
  statusLabel,
  typeLabel,
  when,
} from "./labels";

function StageStrip({ run }: { run: TcRun }) {
  const steps = run.kind === "pattern" ? (["generate", "verify"] as const) : stages;
  const current = steps.indexOf(run.stage as (typeof steps)[number]);
  return (
    <ol className="flex flex-wrap gap-2" aria-label="진행 단계">
      {steps.map((stage, index) => {
        const state =
          run.status === "done" || index < current
            ? "done"
            : index > current
              ? "wait"
              : run.status === "failed"
                ? "failed"
                : "running";
        return (
          <li key={stage} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{index + 1}</span>
            {run.kind === "pattern" && stage === "generate" ? "패턴 전개" : stageLabel[stage]}
            <Badge
              variant={state === "done" ? "success" : state === "failed" ? "destructive" : state === "running" ? "secondary" : "outline"}
            >
              {state === "done" ? "완료" : state === "failed" ? "실패" : state === "running" ? "진행 중" : "대기"}
            </Badge>
          </li>
        );
      })}
    </ol>
  );
}

export function TcRunDetail({ projectId, runId, onBack }: { projectId: string; runId: string; onBack: () => void }) {
  const [run, setRun] = useState<TcRun | null>(null);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<TestCase | null>(null);
  const [removing, setRemoving] = useState(false);
  const [tick, setTick] = useState(0);
  const status = run?.status;

  useEffect(() => {
    const controller = new AbortController();
    api
      .tcRun(projectId, runId, tick > 0, controller.signal)
      .then((data) => {
        setRun(data);
        setError("");
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [projectId, runId, tick]);

  useEffect(() => {
    if (status !== "running") return;
    const timer = setTimeout(() => setTick((v) => v + 1), 1500);
    return () => clearTimeout(timer);
  }, [status, run?.updated, tick]);

  if (!run)
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft />
          목록
        </Button>
        <p role={error ? "alert" : "status"} className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {error || "불러오는 중이에요"}
        </p>
      </div>
    );

  const count = (type: TestCase["type"]) => run.cases.filter((c) => c.type === type).length;
  const conditionText = new Map(run.conditions.map((c) => [c.id, c.description]));
  const problems = run.issues.filter((i) => i.level !== "info").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={run.title}
        description={run.message}
        actions={
          <>
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft />
              목록
            </Button>
            {run.status === "done" && (
              <Button variant="outline" asChild>
                <a href={api.tcExportUrl(projectId, run.id)} download>
                  <Download />
                  CSV
                </a>
              </Button>
            )}
            {run.status !== "running" && (
              <Button variant="danger-ghost" onClick={() => setRemoving(true)}>
                <Trash2 />
                삭제
              </Button>
            )}
          </>
        }
      />
      <StageStrip run={run} />
      <div className="flex flex-wrap gap-2">
        <Badge variant={run.status === "done" ? "success" : run.status === "failed" ? "destructive" : "secondary"}>
          {statusLabel[run.status]}
        </Badge>
        <Badge variant="outline">요구사항 {run.requirements.length}</Badge>
        <Badge variant="outline">조건 {run.conditions.length}</Badge>
        <Badge variant="outline">
          TC {run.cases.length} · 정상 {count("normal")} · 예외 {count("exception")} · 경계 {count("boundary")}
        </Badge>
        {run.status !== "running" && (
          <Badge variant={run.integrity ? "success" : "destructive"}>{run.integrity ? "무결성 확인" : "무결성 불일치"}</Badge>
        )}
        <Badge variant="offline">암호화 저장 · 보관 {run.retentionDays}일</Badge>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Tabs defaultValue="cases">
        <TabsList aria-label="생성 결과">
          <TabsTrigger value="cases">테스트케이스</TabsTrigger>
          <TabsTrigger value="trace">요구사항·매핑</TabsTrigger>
          <TabsTrigger value="conditions">조건·경계</TabsTrigger>
          <TabsTrigger value="issues">검증 결과 {problems ? `(${problems})` : ""}</TabsTrigger>
          <TabsTrigger value="log">처리 기록</TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="pt-4">
          <DataTable
            data={run.cases}
            caption="생성된 테스트케이스"
            selectable={false}
            getRowId={(c) => c.id}
            getRowLabel={(c) => c.title}
            searchText={(c) => `${c.id} ${c.title} ${c.requirementIds.join(" ")} ${c.input} ${c.expected}`}
            searchPlaceholder="TC·요구사항 번호, 제목, 입력, 기대결과 검색"
            emptyMessage={run.status === "running" ? "생성 중이에요." : "생성된 테스트케이스가 없어요."}
            onRowClick={setOpened}
            columns={[
              { id: "id", header: "TC", defaultWidth: 120, sortValue: (c) => c.id, cell: (c) => c.id },
              {
                id: "type",
                header: "유형",
                defaultWidth: 120,
                sortValue: (c) => c.type,
                cell: (c) => <Badge variant={c.type === "normal" ? "secondary" : c.type === "exception" ? "outline" : "default"}>{typeLabel[c.type]}</Badge>,
              },
              {
                id: "title",
                header: "제목",
                defaultWidth: 320,
                sortValue: (c) => c.title,
                cell: (c) => (
                  <Button variant="link" onClick={() => setOpened(c)}>
                    {c.title}
                  </Button>
                ),
              },
              { id: "req", header: "요구사항", defaultWidth: 140, sortValue: (c) => c.requirementIds.join(","), cell: (c) => c.requirementIds.join(", ") },
              { id: "input", header: "입력", defaultWidth: 280, cell: (c) => c.input || "—" },
              { id: "expected", header: "기대결과", defaultWidth: 320, cell: (c) => c.expected },
              { id: "origin", header: "출처", defaultWidth: 120, sortValue: (c) => c.origin, cell: (c) => originLabel[c.origin] },
            ]}
          />
        </TabsContent>

        <TabsContent value="trace" className="space-y-6 pt-4">
          {(run.sensitive.length > 0 || run.blocked.length > 0 || run.corrections.length > 0) && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">입력 정리</h2>
              <div className="flex flex-wrap gap-2">
                {run.sensitive.map((t) => (
                  <Badge key={t.type} variant="outline">
                    마스킹 · {t.label} {t.count}건
                  </Badge>
                ))}
                {run.corrections.map((c) => (
                  <Badge key={c} variant="secondary">
                    정리 · {c}
                  </Badge>
                ))}
              </div>
              {run.blocked.map((line) => (
                <p key={line} className="text-sm text-destructive">
                  지시문으로 보여 뺀 문장: {line}
                </p>
              ))}
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">요구사항–TC 매핑</h2>
            <Table variant="bordered">
              <TableHeader>
                <TableRow variant="static">
                  <TableHead>요구사항</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead>정상</TableHead>
                  <TableHead>예외</TableHead>
                  <TableHead>경계</TableHead>
                  <TableHead>TC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.requirements.map((r) => {
                  const linked = run.cases.filter((c) => c.requirementIds.includes(r.id));
                  const by = (t: TestCase["type"]) => linked.filter((c) => c.type === t).length;
                  return (
                    <TableRow key={r.id} variant="static">
                      <TableCell>{r.id}</TableCell>
                      <TableCell className="whitespace-normal">
                        {r.section && <span className="text-muted-foreground">{r.section} · </span>}
                        {r.text}
                      </TableCell>
                      <TableCell>{by("normal")}</TableCell>
                      <TableCell>{by("exception")}</TableCell>
                      <TableCell>{by("boundary")}</TableCell>
                      <TableCell>
                        {linked.length ? (
                          <span className="whitespace-normal">{linked.map((c) => c.id).join(", ")}</span>
                        ) : (
                          <Badge variant="destructive">미커버</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        <TabsContent value="conditions" className="pt-4">
          <DataTable
            data={run.conditions}
            caption="테스트 조건·경계 항목"
            selectable={false}
            getRowId={(c) => c.id}
            getRowLabel={(c) => c.description}
            searchText={(c) => `${c.id} ${c.subject} ${c.description} ${c.evidence}`}
            searchPlaceholder="조건 검색"
            emptyMessage={run.status === "running" ? "추출 중이에요." : "추출된 조건이 없어요."}
            columns={[
              { id: "id", header: "ID", defaultWidth: 120, sortValue: (c) => c.id, cell: (c) => c.id },
              { id: "kind", header: "종류", defaultWidth: 120, sortValue: (c) => c.kind, cell: (c) => kindLabel[c.kind] },
              { id: "req", header: "요구사항", defaultWidth: 140, cell: (c) => c.requirementIds.join(", ") },
              { id: "description", header: "조건", defaultWidth: 360, cell: (c) => c.description },
              { id: "values", header: "값", defaultWidth: 220, cell: (c) => c.values.join(", ") || "—" },
              {
                id: "evidence",
                header: "근거",
                defaultWidth: 280,
                cell: (c) => (
                  <div className="space-y-1 whitespace-normal">
                    <Badge variant={c.grounded ? "success" : "destructive"}>{c.grounded ? "원문 확인" : "원문 없음"}</Badge>
                    <p className="text-xs text-muted-foreground">{c.evidence || "—"}</p>
                  </div>
                ),
              },
              { id: "origin", header: "출처", defaultWidth: 120, cell: (c) => originLabel[c.origin] },
            ]}
          />
        </TabsContent>

        <TabsContent value="issues" className="pt-4">
          {run.issues.length ? (
            <ul className="space-y-2">
              {run.issues.map((issue, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Badge variant={issue.level === "error" ? "destructive" : issue.level === "warning" ? "outline" : "secondary"}>
                    {levelLabel[issue.level]}
                  </Badge>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{run.status === "running" ? "검증 전이에요." : "검증에서 걸린 항목이 없어요."}</p>
          )}
        </TabsContent>

        <TabsContent value="log" className="space-y-6 pt-4">
          <section className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">모델 · </span>
              {run.model}
            </p>
            <p>
              <span className="text-muted-foreground">생성 · </span>
              {run.createdBy} · {when(run.created)}
            </p>
            <p className="break-all">
              <span className="text-muted-foreground">SHA-256 · </span>
              {run.hash}
            </p>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">처리 단계</h2>
            <Table variant="bordered">
              <TableHeader>
                <TableRow variant="static">
                  <TableHead>단계</TableHead>
                  <TableHead>소요</TableHead>
                  <TableHead>입력 크기</TableHead>
                  <TableHead>산출</TableHead>
                  <TableHead>결과</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.calls.map((c, index) => (
                  <TableRow key={index} variant="static">
                    <TableCell>{stageLabel[c.stage]}</TableCell>
                    <TableCell>{(c.ms / 1000).toFixed(1)}초</TableCell>
                    <TableCell>{c.inputChars.toLocaleString()}</TableCell>
                    <TableCell>{c.outputCount}</TableCell>
                    <TableCell className="whitespace-normal">{c.ok ? "성공" : `실패 · ${c.error ?? ""}`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">접근 기록</h2>
            <Table variant="bordered">
              <TableHeader>
                <TableRow variant="static">
                  <TableHead>사용자</TableHead>
                  <TableHead>동작</TableHead>
                  <TableHead>시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.access.map((a, index) => (
                  <TableRow key={index} variant="static">
                    <TableCell>{a.user}</TableCell>
                    <TableCell>{a.action}</TableCell>
                    <TableCell>{when(a.at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={!!opened} onOpenChange={(open) => !open && setOpened(null)}>
        <DialogContent variant="form">
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {opened.id} · {opened.title}
                </DialogTitle>
                <DialogDescription>
                  {typeLabel[opened.type]} · {originLabel[opened.origin]} · {opened.requirementIds.join(", ")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {opened.preconditions.length > 0 && (
                  <section className="space-y-1">
                    <h3 className="font-medium">사전조건</h3>
                    {opened.preconditions.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </section>
                )}
                <section className="space-y-1">
                  <h3 className="font-medium">단계</h3>
                  <ol className="list-decimal space-y-1 pl-5">
                    {opened.steps.map((s, index) => (
                      <li key={index}>{s}</li>
                    ))}
                  </ol>
                </section>
                <section className="space-y-1">
                  <h3 className="font-medium">입력</h3>
                  <p>{opened.input || "—"}</p>
                </section>
                <section className="space-y-1">
                  <h3 className="font-medium">기대결과</h3>
                  <p>{opened.expected}</p>
                </section>
                <section className="space-y-1">
                  <h3 className="font-medium">근거</h3>
                  <p>{opened.rationale || "—"}</p>
                  {opened.conditionIds.map((id) => (
                    <p key={id} className="text-muted-foreground">
                      {id} · {conditionText.get(id)}
                    </p>
                  ))}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>생성 기록 삭제</DialogTitle>
            <DialogDescription>「{run.title}」의 테스트케이스 {run.cases.length}개를 지워요. 되돌릴 수 없어요.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void api
                  .removeTcRun(projectId, run.id)
                  .then(onBack)
                  .catch((e: unknown) => {
                    setRemoving(false);
                    setError(errorText(e));
                  });
              }}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
