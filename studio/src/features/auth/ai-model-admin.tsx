import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { API } from "@/lib/api";
export function AiModelAdmin() {
  const [model, setModel] = useState(""),
    [configured, setConfigured] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(API + "/admin/ai-model", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ model: string; configured: boolean }>;
      })
      .then((data) => {
        setModel(data.model);
        setConfigured(data.configured);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("모델 설정을 불러오지 못했어요. 화면을 다시 열어 주세요.");
      });
    return () => controller.abort();
  }, []);
  async function save() {
    if (busy || !loaded) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const r = await fetch(API + "/admin/ai-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.trim() }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error || "저장하지 못했어요.");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 모델 관리"
        description="Studio에서 사용할 기본 AI 모델을 관리해요."
      />
      <Card>
        <CardHeader>
          <h2 className="font-semibold">기본 모델</h2>
        </CardHeader>
        <CardContent>
          <form
            className="max-w-xl space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="flex items-center gap-2">
              <span>OpenRouter</span>
              <Badge variant="secondary">
                {loaded
                  ? configured
                    ? "API 키 설정됨"
                    : "API 키 미설정"
                  : "설정 확인 중"}
              </Badge>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-model">모델 ID</Label>
              <Input
                id="ai-model"
                value={model}
                disabled={!loaded || busy}
                required
                maxLength={200}
                placeholder="공급자/모델"
                onChange={(e) => {
                  setModel(e.target.value);
                  setSaved(false);
                }}
              />
              <p className="text-sm text-muted-foreground">
                저장한 모델은 다음 Studio AI 요청부터 적용돼요. 모델 ID는
                OpenRouter에서 사용 가능한 값으로 입력해 주세요.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              API 키는 서버 환경변수에서 관리해요. 이 화면에 키 값은 표시하지
              않아요.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {saved && (
              <p role="status" className="text-sm">
                모델 설정을 저장했어요.
              </p>
            )}
            <Button type="submit" disabled={!loaded || busy}>
              저장
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
