import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Sparkles } from "@/components/ui/material-icons";
import { api } from "@/lib/api";
import type { TcRunSummary } from "../../../../contracts/studio";
import { errorText, SAMPLE_REQUIREMENTS, statusLabel, when } from "./labels";
import { TcRunDetail } from "./run-detail";
import { TcPatterns } from "./patterns";

// 목록이 첫 화면이다. 만들기는 목록 위 버튼으로 들어간다 (2026-11-13).
type View = "list" | "requirement" | "pattern";

export function TcGeneration({ projectId }: { projectId: string }) {
  const [view, setView] = useState<View>("list");
  const [runId, setRunId] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<TcRunSummary[]>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (view !== "list" || runId) return;
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
          setView("list");
          setRevision((v) => v + 1);
        }}
      />
    );

  const back = (
    <Button variant="outline" onClick={() => { setError(""); setView("list"); }}>
      <ArrowLeft />
      목록으로
    </Button>
  );
  const errorLine = error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );

  if (view === "requirement")
    return (
      <div className="space-y-6">
        <PageHeader
          title="요구사항으로 만들기"
          description="요구사항을 붙여 넣으면 시험해 볼 목록(테스트케이스)을 만들어 줘요. 정상으로 될 때, 막혀야 할 때, 한도 같은 기준값의 바로 위아래까지 빠짐없이 뽑아요."
          actions={back}
        />
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
              placeholder="나중에 찾을 이름 (비우면 첫 줄로 정해요)"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tc-text">요구사항</Label>
            <Textarea
              id="tc-text"
              rows={14}
              value={text}
              maxLength={20000}
              placeholder={"한 줄에 하나씩 적어요. 예)\nSR-2101 1회 이체 금액은 최소 1원, 최대 500만원까지 입력할 수 있다\n\n앞에 SR-2101 같은 번호를 붙이면 결과에서 어느 요구사항의 시험인지 그 번호로 보여 줘요."}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {text.length.toLocaleString()} / 20,000자 · 주민번호·계좌·전화번호 같은 개인정보는 가린 뒤 AI에 보내고, 붙여 넣은 원문은 저장하지 않아요.
            </p>
          </div>
          {errorLine}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !text.trim()}>
              {busy ? "시작하는 중" : "테스트케이스 만들기"}
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
      </div>
    );

  if (view === "pattern")
    return (
      <div className="space-y-6">
        <PageHeader title="상품 규칙으로 만들기" actions={back} />
        <TcPatterns projectId={projectId} onRun={setRunId} />
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="테스트케이스 관리"
        description="만든 테스트케이스 목록이에요. 요구사항이나 상품 규칙을 넣으면 새로 만들어 줘요."
        actions={
          <>
            <Button onClick={() => { setError(""); setView("requirement"); }}>
              <Plus />
              요구사항으로 만들기
            </Button>
            <Button variant="outline" onClick={() => { setError(""); setView("pattern"); }}>
              <Sparkles />
              상품 규칙으로 만들기
            </Button>
          </>
        }
      />
      {errorLine}
      <DataTable
        data={runs}
        caption="테스트케이스 생성 기록"
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.title}
        searchText={(r) => `${r.title} ${r.createdBy}`}
        searchPlaceholder="제목 또는 생성자 검색"
        emptyMessage="아직 생성한 테스트케이스가 없어요."
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
          { id: "cases", header: "테스트케이스", sortValue: (r) => r.cases, cell: (r) => r.cases },
          { id: "createdBy", header: "생성자", sortValue: (r) => r.createdBy, cell: (r) => r.createdBy },
          { id: "created", header: "생성일", sortValue: (r) => r.created, cell: (r) => when(r.created) },
        ]}
      />
    </div>
  );
}
