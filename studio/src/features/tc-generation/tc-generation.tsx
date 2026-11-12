import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { TcRunSummary } from "../../../../contracts/studio";
import { errorText, SAMPLE_REQUIREMENTS, statusLabel, when } from "./labels";
import { TcRunDetail } from "./run-detail";
import { TcPatterns } from "./patterns";

type View = "requirement" | "pattern" | "history";

export function TcGeneration({ projectId }: { projectId: string }) {
  const [view, setView] = useState<View>("requirement");
  const [runId, setRunId] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<TcRunSummary[]>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (view !== "history" || runId) return;
    const controller = new AbortController();
    api
      .tcRuns(projectId, controller.signal)
      .then((data) => {
        setRuns(data);
        setError("");
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [projectId, view, runId, revision]);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { id } = await api.startTcRun(projectId, title, text);
      setRunId(id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (runId)
    return (
      <TcRunDetail
        projectId={projectId}
        runId={runId}
        onBack={() => {
          setRunId("");
          setView("history");
          setRevision((v) => v + 1);
        }}
      />
    );

  return (
    <div className="space-y-6">
      <PageHeader title="TC 생성" />
      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList aria-label="TC 생성 방식">
          <TabsTrigger value="requirement">요구사항 기반</TabsTrigger>
          <TabsTrigger value="pattern">상품 패턴</TabsTrigger>
          <TabsTrigger value="history">생성 기록</TabsTrigger>
        </TabsList>
        <TabsContent value="requirement" className="space-y-4 pt-4">
          <form
            className="max-w-4xl space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="tc-title">제목</Label>
              <Input
                id="tc-title"
                value={title}
                maxLength={80}
                placeholder="비우면 첫 요구사항으로 정해요"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tc-text">요구사항·SR 명세</Label>
              <Textarea
                id="tc-text"
                rows={14}
                value={text}
                maxLength={20000}
                placeholder={"한 줄에 요구사항 하나씩 적어요. SR-1234처럼 번호를 붙이면 그대로 매핑해요.\n# 으로 시작하는 줄은 화면·업무 구분 제목이에요."}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {text.length.toLocaleString()} / 20,000자 · 주민번호·계좌·카드·전화번호는 마스킹한 뒤 AI에 보내고, 원문은 저장하지 않아요.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !text.trim()}>
                {busy ? "시작하는 중" : "TC 생성"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setTitle("모바일 계좌이체 (예시)");
                  setText(SAMPLE_REQUIREMENTS);
                }}
              >
                예시 넣기
              </Button>
            </div>
          </form>
        </TabsContent>
        <TabsContent value="pattern" className="pt-4">
          {view === "pattern" && <TcPatterns projectId={projectId} onRun={setRunId} />}
        </TabsContent>
        <TabsContent value="history" className="space-y-4 pt-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DataTable
            data={runs}
            caption="TC 생성 기록"
            getRowId={(r) => r.id}
            getRowLabel={(r) => r.title}
            searchText={(r) => `${r.title} ${r.createdBy}`}
            searchPlaceholder="제목 또는 생성자 검색"
            emptyMessage="아직 생성한 TC가 없어요."
            onRowClick={(r) => setRunId(r.id)}
            onDeleteRows={async (rows) => {
              try {
                for (const row of rows) await api.removeTcRun(projectId, row.id);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setRevision((v) => v + 1);
              }
            }}
            columns={[
              {
                id: "title",
                header: "제목",
                defaultWidth: 360,
                sortValue: (r) => r.title,
                cell: (r) => (
                  <Button variant="link" onClick={() => setRunId(r.id)}>
                    {r.title}
                  </Button>
                ),
              },
              {
                id: "kind",
                header: "방식",
                sortValue: (r) => r.kind,
                cell: (r) => (r.kind === "pattern" ? "상품 패턴" : "요구사항"),
              },
              {
                id: "status",
                header: "상태",
                sortValue: (r) => r.status,
                cell: (r) => (
                  <Badge variant={r.status === "done" ? "success" : r.status === "failed" ? "destructive" : "secondary"}>
                    {statusLabel[r.status]}
                  </Badge>
                ),
              },
              { id: "requirements", header: "요구사항", sortValue: (r) => r.requirements, cell: (r) => r.requirements },
              { id: "cases", header: "TC", sortValue: (r) => r.cases, cell: (r) => r.cases },
              { id: "createdBy", header: "생성자", sortValue: (r) => r.createdBy, cell: (r) => r.createdBy },
              { id: "created", header: "생성일", sortValue: (r) => r.created, cell: (r) => when(r.created) },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
