import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { JsonDataEditor, jsonError } from "@/features/projects/json-data-editor";
import { api } from "@/lib/api";
import type { TcPattern } from "../../../../contracts/studio";
import { domainLabel, errorText, SAMPLE_PATTERN_SPEC } from "./labels";

type Editing = { id?: string; builtIn: boolean; json: string; note?: string };
const editable = (p: TcPattern) => {
  const { domain, name, description, fields, branches, rules } = p;
  return JSON.stringify({ domain, name, description, fields, branches, rules }, null, 2);
};
const TEMPLATE = JSON.stringify(
  {
    domain: "loan",
    name: "새 상품 패턴",
    description: "",
    fields: [{ key: "score", label: "신용점수", type: "number", unit: "점", sample: "750" }],
    branches: [],
    rules: [{ code: "R01", reason: "신용점수 기준 미달", field: "score", op: "<", value: "600" }],
  },
  null,
  2,
);

export function TcPatterns({ projectId, onRun }: { projectId: string; onRun: (runId: string) => void }) {
  const [patterns, setPatterns] = useState<TcPattern[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [valid, setValid] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [spec, setSpec] = useState("");
  const [domain, setDomain] = useState<TcPattern["domain"]>("loan");
  const [dialogError, setDialogError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api
      .tcPatterns(projectId, controller.signal)
      .then((data) => {
        setPatterns(data);
        setError("");
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [projectId, revision]);

  async function expand(p: TcPattern) {
    if (busy) return;
    setBusy(true);
    try {
      onRun((await api.startTcPatternRun(projectId, p.id)).id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    setDialogError("");
    try {
      await api.saveTcPattern(projectId, JSON.parse(editing.json), editing.id);
      setEditing(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setDialogError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function extract() {
    if (busy) return;
    setBusy(true);
    setDialogError("");
    try {
      const result = await api.extractTcPattern(projectId, spec, domain);
      const notes = [
        result.ungrounded ? `원문에서 근거를 찾지 못한 분기·룰 ${result.ungrounded}개 — 확인 후 저장하세요.` : "",
        ...result.dropped,
        result.blocked.length ? `지시문으로 보여 뺀 문장 ${result.blocked.length}개` : "",
        result.sensitive.length ? "민감정보를 마스킹한 뒤 추출했어요." : "",
      ].filter(Boolean);
      setExtracting(false);
      setValid(true);
      setEditing({ builtIn: false, json: JSON.stringify(result.pattern, null, 2), note: notes.join(" ") || "추출한 패턴을 확인하고 저장하면 패턴 라이브러리에 등록돼요." });
    } catch (e) {
      setDialogError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        대출 거절 기준(신용점수 600점 미만이면 거절 등)이나 가입 화면이 갈리는 조건을 상품별로 등록해 두면, 기준마다 &lsquo;거절되는 값&rsquo;과 &lsquo;바로 통과하는 값&rsquo;을 빠짐없이 시험 목록으로 만들어요. 이름을 누르면 바로 만들어요.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setDialogError("");
            setExtracting(true);
          }}
        >
          상품 설명에서 규칙 뽑기
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setDialogError("");
            setValid(true);
            setEditing({ builtIn: false, json: TEMPLATE });
          }}
        >
          규칙 직접 입력
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DataTable
        data={patterns}
        caption="상품 패턴 라이브러리"
        selectable={false}
        getRowId={(p) => p.id}
        getRowLabel={(p) => p.name}
        searchText={(p) => `${p.name} ${p.description} ${domainLabel[p.domain]}`}
        searchPlaceholder="패턴 이름 검색"
        emptyMessage="등록된 패턴이 없어요."
        rowActions={(p) => [
          { label: "테스트케이스 만들기", onSelect: () => void expand(p), disabled: busy },
          { label: p.builtIn ? "보기" : "수정", onSelect: () => (setDialogError(""), setValid(true), setEditing({ id: p.builtIn ? undefined : p.id, builtIn: p.builtIn, json: editable(p) })) },
          { label: "복제해서 등록", onSelect: () => (setDialogError(""), setValid(true), setEditing({ builtIn: false, json: editable({ ...p, name: `${p.name} 사본` }) })) },
          ...(p.builtIn
            ? []
            : [
                {
                  label: "삭제",
                  onSelect: () =>
                    void api
                      .saveTcPattern(projectId, null, p.id, true)
                      .then(() => setRevision((v) => v + 1))
                      .catch((e: unknown) => setError(errorText(e))),
                },
              ]),
        ]}
        columns={[
          {
            id: "name",
            header: "패턴",
            defaultWidth: 320,
            sortValue: (p) => p.name,
            cell: (p) => (
              <Button variant="link" disabled={busy} onClick={() => void expand(p)}>
                {p.name}
              </Button>
            ),
          },
          { id: "domain", header: "영역", sortValue: (p) => p.domain, cell: (p) => domainLabel[p.domain] },
          { id: "fields", header: "입력 항목", sortValue: (p) => p.fields.length, cell: (p) => p.fields.length },
          { id: "branches", header: "화면 분기", sortValue: (p) => p.branches.length, cell: (p) => p.branches.length },
          { id: "rules", header: "부결 룰", sortValue: (p) => p.rules.length, cell: (p) => p.rules.length },
          {
            id: "kind",
            header: "구분",
            sortValue: (p) => (p.builtIn ? 0 : 1),
            cell: (p) => <Badge variant={p.builtIn ? "secondary" : "outline"}>{p.builtIn ? "기본 예시" : "등록"}</Badge>,
          },
          { id: "description", header: "설명", defaultWidth: 360, cell: (p) => p.description || "—" },
        ]}
      />

      <Dialog open={extracting} onOpenChange={(open) => !busy && setExtracting(open)}>
        <DialogContent variant="download">
          <DialogHeader>
            <DialogTitle>상품 설명에서 규칙 뽑기</DialogTitle>
            <DialogDescription>상품 설명서·심사 기준 문장에서 입력 항목, 화면 분기, 부결 룰을 뽑아 패턴 초안을 만들어요.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void extract();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="tc-pattern-domain">영역</Label>
              <Select value={domain} onValueChange={(v) => setDomain(v as TcPattern["domain"])}>
                <SelectTrigger id="tc-pattern-domain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">수신</SelectItem>
                  <SelectItem value="loan">여신</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tc-pattern-spec">상품 명세</Label>
              <Textarea id="tc-pattern-spec" rows={10} value={spec} maxLength={20000} onChange={(e) => setSpec(e.target.value)} />
            </div>
            {dialogError && (
              <p role="alert" className="text-sm text-destructive">
                {dialogError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => (setSpec(SAMPLE_PATTERN_SPEC), setDomain("loan"))}>
                예시 넣기
              </Button>
              <Button type="submit" disabled={busy || !spec.trim()}>
                {busy ? "추출하는 중" : "추출"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && !busy && setEditing(null)}>
        <DialogContent variant="download">
          <DialogHeader>
            <DialogTitle>{editing?.builtIn ? "기본 패턴 (읽기 전용)" : editing?.id ? "패턴 수정" : "패턴 등록"}</DialogTitle>
            <DialogDescription>
              {editing?.note ||
                "fields는 입력 항목(min·max·선택지), branches는 선택값별 화면 분기, rules는 '값 op 기준'이 참이면 부결하는 룰이에요."}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!editing.builtIn && valid && !jsonError(editing.json)) void save();
              }}
            >
              <JsonDataEditor value={editing.json} onChange={(json) => setEditing({ ...editing, json })} onValidityChange={setValid} />
              {dialogError && (
                <p role="alert" className="text-sm text-destructive">
                  {dialogError}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>
                  닫기
                </Button>
                {editing.builtIn ? (
                  <Button type="button" onClick={() => setEditing({ builtIn: false, json: editing.json.replace(/"name": "([^"]*)"/, '"name": "$1 사본"') })}>
                    복제해서 등록
                  </Button>
                ) : (
                  <Button type="submit" disabled={busy || !valid}>
                    {busy ? "저장하는 중" : "저장"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
