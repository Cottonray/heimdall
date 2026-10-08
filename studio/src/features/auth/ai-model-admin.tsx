import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { API } from "@/lib/api";
export function AiModelAdmin() {
  const [provider, setProvider] = useState("openrouter");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [savedConnection, setSavedConnection] = useState("");
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
        return r.json() as Promise<{
          model: string;
          configured: boolean;
          provider: string;
          baseUrl: string;
        }>;
      })
      .then((data) => {
        setModel(data.model);
        setProvider(data.provider);
        if (data.provider === "openai-compatible") setBaseUrl(data.baseUrl);
        setSavedConnection(`${data.provider}:${data.baseUrl}`);
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
        body: JSON.stringify({
          model: model.trim(),
          provider,
          baseUrl,
          apiKey: apiKey || undefined,
        }),
      });
      const data = (await r.json()) as {
        error?: string;
        configured: boolean;
        provider: string;
        baseUrl: string;
      };
      if (!r.ok) throw new Error(data.error || "저장하지 못했어요.");
      setConfigured(data.configured);
      setSavedConnection(`${data.provider}:${data.baseUrl}`);
      setApiKey("");
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
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="ai-provider">API 제공자</Label>
              <Select
                value={provider}
                disabled={!loaded || busy}
                onValueChange={(value) => {
                  setProvider(value);
                  setApiKey("");
                  setSaved(false);
                }}
              >
                <SelectTrigger id="ai-provider" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="openai-compatible">
                    OpenAI 호환 API
                  </SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="secondary">
                {loaded
                  ? configured &&
                    savedConnection ===
                      `${provider}:${provider === "openrouter" ? "https://openrouter.ai/api/v1" : baseUrl.replace(/\/+$/, "")}`
                    ? "API 키 설정됨"
                    : "API 키 미설정"
                  : "설정 확인 중"}
              </Badge>
            </div>
            {provider === "openai-compatible" && (
              <div className="space-y-2">
                <Label htmlFor="ai-base-url">API 기본 주소</Label>
                <Input
                  id="ai-base-url"
                  type="url"
                  value={baseUrl}
                  required
                  disabled={!loaded || busy}
                  placeholder="https://api.example.com/v1"
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    setApiKey("");
                    setSaved(false);
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  OpenAI Chat Completions 형식의 API를 사용해요.
                  /chat/completions 앞까지 입력해 주세요.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="ai-model">모델 ID</Label>
              <Input
                id="ai-model"
                value={model}
                disabled={!loaded || busy}
                required
                maxLength={200}
                placeholder={
                  provider === "openrouter" ? "공급자/모델" : "모델 ID"
                }
                onChange={(e) => {
                  setModel(e.target.value);
                  setSaved(false);
                }}
              />
              <p className="text-sm text-muted-foreground">
                저장한 설정은 다음 Studio AI 요청부터 적용돼요. 선택한 API에서
                사용할 수 있는 모델 ID를 입력해 주세요.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-api-key">API 키</Label>
              <Input
                id="ai-api-key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={apiKey}
                maxLength={8192}
                disabled={!loaded || busy}
                placeholder="새 API 키"
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setSaved(false);
                }}
              />
              <p className="text-sm text-muted-foreground">
                저장된 키는 표시하지 않아요. 비워두면 같은 제공자·주소의 기존
                키를 유지해요. 키가 필요 없는 호환 서버는 빈 값으로 사용할 수
                있어요.
              </p>
            </div>
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
