import { useEffect, useState } from "react";
import {
  Sparkles,
  Play,
  Square,
  Check,
  ScanSearch,
  ArrowUpRight,
  Circle,
  Smartphone,
  FileCode2,
  Eye,
} from "@/components/ui/material-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { API, evidenceUrl } from "@/lib/api";
import type { Campaign } from "../../../../contracts/campaign";
const labels = {
  queued: "대기",
  running: "실행 중",
  passed: "검증 통과",
  attention: "확인 필요",
};
export function CampaignPanel({
  projectId,
  active,
  onSelect,
}: {
  projectId: string;
  active: boolean;
  onSelect?: (id: string) => void;
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [engine, setEngine] = useState("android");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const r = await fetch(
          API + "/campaigns?" + new URLSearchParams({ projectId }),
        );
        if (!r.ok) throw Error("자동 탐색 현황을 불러오지 못했어요");
        const c = await r.json();
        if (!cancelled) {
          setCampaign(c);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 2000);
      }
    };
    if (active) void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, active]);
  async function command(action: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(API + "/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          action,
          engine,
          url: engine === "mobile-web" ? url : undefined,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error || "요청에 실패했어요");
      setCampaign(body);
      setSelected("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const cases = campaign?.cases || [];
  const running =
    campaign?.status === "running" || campaign?.status === "discovering";
  const current =
    cases.find((x) => x.id === selected) ||
    cases.find((x) => x.status === "running") ||
    cases.find((x) => x.status === "attention") ||
    cases.at(-1);
  const stats = [
    ["발견한 시나리오", cases.length],
    ["실제 검증 통과", cases.filter((x) => x.status === "passed").length],
    ["결과 확인", cases.reduce((n, x) => n + x.assertions, 0)],
    ["사람 확인 필요", cases.filter((x) => x.status === "attention").length],
  ];
  const canRun =
    campaign &&
    ["ready", "stopped", "completed"].includes(campaign.status) &&
    cases.length > 0;
  return (
    <section className="space-y-5" aria-label="AI 자동 탐색">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="outline">
            <Sparkles /> AI 자동 탐색
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">
            테스트할 곳을 찾아, 직접 검증해요.
          </h2>
          <p className="text-sm text-muted-foreground">
            소스와 화면에서 발견한 시나리오를 실제 기기에서 실행하고 증거로
            남겨요.
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void command("stop")}
            >
              <Square />
              중지
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void command("discover")}
            >
              <ScanSearch />
              발견
            </Button>
          )}
          {canRun && (
            <Button disabled={busy} onClick={() => void command("run")}>
              <Play />
              {campaign?.status === "completed" ? "재검증" : "일괄 실행"}
            </Button>
          )}
        </div>
      </div>
      {!running && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="campaign-engine">실행 환경</Label>
            <Select value={engine} onValueChange={setEngine}>
              <SelectTrigger id="campaign-engine">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="android">Android · Appium</SelectItem>
                <SelectItem value="mobile-web">모바일 웹</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {engine === "mobile-web" && (
            <div className="flex-1 space-y-2">
              <Label htmlFor="campaign-url">테스트 URL</Label>
              <Input
                id="campaign-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-semibold tabular-nums tracking-tight">
                {value}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {label === "결과 확인" ? "회" : "개"}
                </span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileCode2 className="size-4" />
          소스 {campaign?.sourceFiles || 0}개 파일 발췌
        </span>
        <span className="flex items-center gap-1">
          <Smartphone className="size-4" />
          {campaign?.engine === "mobile-web" ? "모바일 웹" : "Android · Appium"}
        </span>
        <span>
          AI 동작 {cases.reduce((n, x) => n + x.steps - x.humanActions, 0)}회
        </span>
        <span>사람 동작 {cases.reduce((n, x) => n + x.humanActions, 0)}회</span>
        <span>발견 범위의 결과이며 전체 기능 커버리지가 아니에요. 확인 필요는 앱 결함 확정이 아니에요.</span>
      </div>
      <p className="text-sm" role="status">
        {campaign?.message ||
          "발견을 누르면 연결 소스와 첫 화면을 분석해요. 생성된 시나리오는 실행 전 확인할 수 있어요."}
      </p>
      {cases.length > 0 && (
        <div className="grid items-start gap-5 xl:grid-cols-3">
          <div className="space-y-3 xl:col-span-2">
            {cases.map((item, index) => (
              <Card key={item.id}>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <span className="mt-1 text-sm font-mono text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="link"
                          onClick={() => setSelected(item.id)}
                        >
                          {item.title}
                        </Button>
                        <Badge
                          variant={
                            item.status === "passed"
                              ? "success"
                              : item.status === "attention"
                                ? "destructive"
                                : item.status === "running"
                                  ? "default"
                                  : "secondary"
                          }
                        >
                          {item.status === "passed" ? (
                            <Check />
                          ) : item.status === "running" ? (
                            <Play />
                          ) : (
                            <Circle />
                          )}
                          {labels[item.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.expected}
                      </p>
                      {item.review && (
                        <p className="text-xs text-muted-foreground">
                          검토 · {item.review}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{item.steps}단계</span>
                        <span>검증 {item.assertions}회</span>
                        {item.sessionId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onSelect?.(item.sessionId!)}
                          >
                            실행 기록
                            <ArrowUpRight />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${item.title} 증거`}
                      onClick={() => setSelected(item.id)}
                    >
                      <Eye />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-4 xl:sticky xl:top-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {current?.status === "running"
                    ? "지금 AI가 보는 화면"
                    : "실제 실행 증거"}
                </CardTitle>
                <CardDescription>{current?.title}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mx-auto max-w-64">
                  {current?.sessionId &&
                  (current.evidence || current.status === "running") ? (
                    <img
                      className="h-auto w-full rounded-xl border"
                      src={
                        current.status === "running"
                          ? API +
                            "/frame?" +
                            new URLSearchParams({
                              id: current.sessionId,
                              tick: String(campaign?.updated),
                            })
                          : evidenceUrl(current.sessionId, current.evidence!)
                      }
                      alt={`${current.title} 실제 실행 화면`}
                    />
                  ) : (
                    <div className="flex aspect-[9/16] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
                      첫 동작의 증거를 기다려요
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            {current && (
              <Card>
                <CardHeader>
                  <CardTitle>AI 동작 기록</CardTitle>
                  <CardDescription>
                    {current.message || current.goal}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2 text-xs font-mono">
                    {current.trace?.map((line, i) => (
                      <li key={i} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
