import { useEffect, useId, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { actionLabel, engines, runStatus } from "@/lib/labels";
import {
  bindingTargets,
  dataFields,
} from "../../../../server/src/studio/domain/data-bindings";
import type {
  DataBinding,
  RunOptions,
  Session,
  TestDataEntry,
} from "../../../../contracts/studio";
export function ScenarioExecution({
  projectId,
  sessions,
  busy,
  active,
  onRun,
  onPause,
  onSelect,
  onData,
  onScenarios,
}: {
  projectId: string;
  sessions: Session[];
  busy: boolean;
  active: boolean;
  onRun: (args: RunOptions & { id: string }) => Promise<Session | undefined>;
  onPause: (id: string) => Promise<unknown>;
  onSelect: (id: string) => void;
  onData: () => void;
  onScenarios: () => void;
}) {
  const formId = useId();
  const [scenarioId, setScenarioId] = useState("");
  const [dataId, setDataId] = useState("");
  const [entries, setEntries] = useState<TestDataEntry[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [runId, setRunId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scenarios = sessions.filter(
    (s) => (s.steps.length > 0 || !!s.plan) && (s.projectId || "default") === projectId,
  );
  const source = scenarios.find((s) => s.id === scenarioId);
  const entry = entries.find((item) => item.id === dataId);
  const targets = source ? bindingTargets(source) : [];
  let fields: ReturnType<typeof dataFields> = [];
  let dataError = "";
  try {
    if (entry) fields = dataFields(entry);
  } catch {
    dataError = "테스트데이터의 JSON 형식을 확인해 주세요.";
  }
  const bindings: DataBinding[] = targets.flatMap((target) => {
    const path = mapping[`${target.step}:${target.field}`];
    return path && fields.some((field) => field.path === path)
      ? [{ step: target.step, field: target.field, path }]
      : [];
  });
  const run = sessions.find((s) => s.id === runId);
  const running =
    run?.execution?.status === "running" && run.state !== "closed";
  const disabled = busy || submitting || running;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    void api
      .testData(projectId, controller.signal)
      .then((items) => {
        setEntries(items);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("테스트데이터를 불러오지 못했어요. 새로고침해 주세요.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, active, revision]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="테스트 실행"
        description="저장된 시나리오와 테스트데이터를 선택하고 실행해요."
      />
      <form
        className="max-w-3xl space-y-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            !source || !!source.plan ||
            disabled ||
            (dataId !== "original" && (!entry || !bindings.length || dataError))
          )
            return;
          setSubmitting(true);
          setError("");
          try {
            const next = await onRun({
              id: source.id,
              sourceUpdated: source.updated,
              ...(entry
                ? {
                    testDataId: entry.id,
                    testDataUpdated: Number(entry.updated),
                    bindings,
                  }
                : {}),
            });
            if (next) setRunId(next.id);
            else
              setError(
                "실행을 시작하지 못했어요. 화면 상단의 오류를 확인해 주세요.",
              );
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>1. 시나리오</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor={formId + "-scenario"}>실행할 시나리오</Label>
            <Select
              value={scenarioId}
              disabled={disabled || !scenarios.length}
              onValueChange={(value) => {
                setScenarioId(value);
                setMapping({});
              }}
            >
              <SelectTrigger id={formId + "-scenario"}>
                <SelectValue placeholder="시나리오 선택" />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {engines[s.engine].label} · {s.plan?.steps.length ?? s.steps.length}단계{s.plan ? " · 초안" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!scenarios.length && (
              <p className="text-sm text-muted-foreground">
                저장된 동작이 있는 시나리오가 없어요.{" "}
                <Button type="button" variant="link" onClick={onScenarios}>
                  시나리오
                </Button>
              </p>
            )}
            {source?.plan && <p className="text-sm text-muted-foreground">앱 연결과 화면 요소 확인이 필요한 초안이에요. <Button type="button" variant="link" onClick={() => onSelect(source.id)}>시나리오</Button></p>}
            {source && (
              <p className="break-all text-sm text-muted-foreground">
                {engines[source.engine].label} ·{" "}
                {source.engine === "android"
                  ? "연결된 Android 기기"
                  : source.url}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. 테스트데이터</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor={formId + "-data"}>사용할 테스트데이터</Label>
            <Select
              value={dataId}
              disabled={disabled || loading}
              onValueChange={(value) => {
                setDataId(value);
                setMapping({});
              }}
            >
              <SelectTrigger id={formId + "-data"}>
                <SelectValue
                  placeholder={loading ? "불러오는 중" : "테스트데이터 선택"}
                />
              </SelectTrigger>
              <SelectContent>
                {entries.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {item.customerNumber ? " · " + item.customerNumber : ""}
                  </SelectItem>
                ))}
                <SelectItem value="original">
                  데이터 없이 원본 값으로 실행
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                새로고침
              </Button>
              <Button type="button" variant="link" onClick={onData}>
                테스트데이터
              </Button>
            </div>
            {!loading && !entries.length && (
              <p className="text-sm text-muted-foreground">
                프로젝트에 테스트데이터가 없어요. 테스트데이터 화면에서 추가해
                주세요.
              </p>
            )}
            {entry && source && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  데이터를 적용할 입력값이나 검증값을 선택해 주세요. 선택하지
                  않은 항목은 원본 값을 사용해요.
                </p>
                {targets.map((target) => {
                  const key = `${target.step}:${target.field}`;
                  return (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={formId + "-" + key}>{target.label}</Label>
                      <p className="break-all text-xs text-muted-foreground">
                        원본: {target.value || "(비어 있음)"}
                      </p>
                      <Select
                        value={mapping[key] || "original"}
                        disabled={disabled}
                        onValueChange={(value) =>
                          setMapping((previous) => ({
                            ...previous,
                            [key]: value === "original" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger id={formId + "-" + key}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="original">원본 값</SelectItem>
                          {fields.map((field) => (
                            <SelectItem key={field.path} value={field.path}>
                              {field.label} ·{" "}
                              {String(field.value).slice(0, 100)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
                {!targets.length && (
                  <p className="text-sm text-muted-foreground">
                    이 시나리오에는 데이터를 적용할 입력·검증 항목이 없어요.
                    원본 값으로 실행하거나 시나리오에 입력·검증 동작을 추가해
                    주세요.
                  </p>
                )}
                {!!targets.length && !bindings.length && (
                  <p className="text-sm text-muted-foreground">
                    한 항목 이상에 데이터를 연결해야 선택한 데이터로 실행할 수
                    있어요.
                  </p>
                )}
                {!!bindings.length && (
                  <p className="text-sm">
                    {bindings.length}개 항목에 선택한 데이터를 적용해요.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        {(error || dataError) && (
          <p role="alert" className="text-sm text-destructive">
            {error || dataError}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              disabled ||
              loading ||
              !source || !!source.plan ||
              !dataId ||
              (dataId !== "original" &&
                (!entry || !bindings.length || !!dataError))
            }
          >
            {disabled ? "실행 중" : "실행"}
          </Button>
        </div>
      </form>
      {run && (
        <Card>
          <CardHeader>
            <CardTitle>실행 결과</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant={
                  runStatus(run) === "실패"
                    ? "destructive"
                    : runStatus(run) === "통과"
                      ? "success"
                      : "secondary"
                }
              >
                {runStatus(run)}
              </Badge>
              <span>
                {run.steps.length} / {run.execution?.total || 0}단계
              </span>
              {running && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void onPause(run.id)}
                >
                  중지
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelect(run.id)}
              >
                실행 화면
              </Button>
            </div>
            <p className="text-sm">
              {run.execution?.sourceName} ·{" "}
              {run.execution?.testDataName || "원본 값"}
            </p>
            <p className="text-sm text-muted-foreground">{run.message}</p>
            <ol className="space-y-2">
              {run.steps.map((step) => (
                <li key={step.n} className="space-y-1">
                  <p className="text-sm">
                    {step.n}. {actionLabel(step.action).verb} ·{" "}
                    {step.ok && !step.error ? "완료" : "실패"}
                  </p>
                  {step.error && (
                    <p className="break-all text-sm text-destructive">
                      {step.error}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
