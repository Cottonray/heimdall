import { useEffect, useState } from "react";
import { Code, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API } from "@/lib/api";
import type {
  WebViewDiscovery,
  WebViewTarget,
} from "../../../../contracts/studio";

const key = (target: WebViewTarget) => `${target.socket}/${target.id}`;
export function useWebViews(
  serial: string,
  connected: boolean,
  onAuthExpired: () => void,
) {
  const [result, setResult] = useState<WebViewDiscovery>({
    targets: [],
    unavailable: 0,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedSerial, setLoadedSerial] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      setLoading(true);
      try {
        const response = await fetch(
          `${API}/webviews?${new URLSearchParams({ serial })}`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(12000),
            ]),
          },
        );
        if (response.status === 401) {
          onAuthExpired();
          return;
        }
        if (!response.ok)
          throw new Error("웹뷰 목록을 확인하지 못했어요. 다시 시도해 주세요.");
        const next = (await response.json()) as WebViewDiscovery;
        if (!controller.signal.aborted) {
          setResult(next);
          setLoadedSerial(serial);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "웹뷰 목록을 확인하지 못했어요.",
          );
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [serial, connected, revision, onAuthExpired]);
  return {
    ...result,
    error,
    loading,
    initialLoading: loading && loadedSerial !== serial,
    refresh: () => setRevision((n) => n + 1),
  };
}

export function WebViewDebugging({
  serial,
  viewerId,
  canControl,
  discovery,
}: {
  serial: string;
  viewerId: string;
  canControl: boolean;
  discovery: ReturnType<typeof useWebViews>;
}) {
  const [selected, setSelected] = useState("");
  const [inspector, setInspector] = useState<{
    instance: string;
    target: string;
    viewer: string;
    src: string;
  } | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const target =
    discovery.targets.find((item) => key(item) === selected) ||
    discovery.targets[0];
  const current =
    canControl &&
    !discovery.error &&
    inspector?.viewer === viewerId &&
    discovery.targets.some((item) => key(item) === inspector.target)
      ? inspector
      : null;
  async function inspect() {
    if (!target || !canControl) return;
    setInspector(null);
    setOpening(true);
    setError("");
    try {
      const params = new URLSearchParams({
        serial,
        viewer: viewerId,
        socket: target.socket,
        id: target.id,
      });
      const response = await fetch(`${API}/inspector?${params}`, {
        signal: AbortSignal.timeout(15000),
      });
      const body = (await response.json()) as {
        frontend?: string;
        error?: string;
      };
      if (!response.ok || !body.frontend)
        throw new Error(body.error || "인스펙터를 열지 못했어요.");
      const url = new URL(body.frontend, location.origin);
      const ws = new URL("/aiqa/studio/devtools", location.href);
      ws.search = params.toString();
      url.searchParams.set(
        location.protocol === "https:" ? "wss" : "ws",
        ws.host + ws.pathname + ws.search,
      );
      url.searchParams.set("remoteBase", new URL("./", url).href);
      url.searchParams.set("dockSide", "undocked");
      setInspector({
        instance: crypto.randomUUID(),
        target: key(target),
        viewer: viewerId,
        src: url.href,
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "인스펙터를 열지 못했어요.",
      );
    } finally {
      setOpening(false);
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-2">
        <div className="min-w-0 flex-1">
          <Select
            value={target ? key(target) : ""}
            onValueChange={setSelected}
            disabled={!discovery.targets.length}
          >
            <SelectTrigger
              aria-label="디버깅할 웹페이지"
              title={target?.url}
              className="w-full min-w-0"
            >
              <SelectValue
                className="min-w-0 flex-1"
                placeholder="감지된 웹뷰 없음"
              />
            </SelectTrigger>
            <SelectContent>
              {discovery.targets.map((item) => (
                <SelectItem key={key(item)} value={key(item)}>
                  <span className="truncate" title={item.url}>
                    {item.kind === "webview" ? "웹뷰" : "브라우저"} ·{" "}
                    {item.title || "제목 없음"} · {item.url}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="웹뷰 새로고침"
          disabled={discovery.loading}
          onClick={discovery.refresh}
        >
          <RefreshCw />
        </Button>
        <Button
          disabled={!target || !canControl || opening || !!discovery.error}
          onClick={() => void inspect()}
        >
          <Code />
          {opening ? "연결 중" : "인스펙터"}
        </Button>
        {current && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="인스펙터 닫기"
            onClick={() => setInspector(null)}
          >
            <X />
          </Button>
        )}
      </div>
      {(error || discovery.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || discovery.error}
        </p>
      )}
      {!!discovery.unavailable && (
        <p role="status" className="text-sm text-muted-foreground">
          일부 웹뷰가 응답하지 않아요. 잠시 후 다시 확인해 주세요.
        </p>
      )}
      {current ? (
        <iframe
          key={current.instance}
          title="Chrome DevTools 웹뷰 인스펙터"
          src={current.src}
          className="min-h-0 w-full flex-1 border-0 bg-background"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          role="status"
          className="flex flex-1 items-center justify-center bg-muted/40 p-6 text-center text-sm text-muted-foreground"
        >
          {discovery.targets.length
            ? "웹페이지를 선택하고 인스펙터를 열어 주세요."
            : discovery.initialLoading
              ? "웹뷰를 확인하고 있어요."
              : "디버깅 가능한 웹뷰가 없어요. 앱에서 웹페이지를 열고 WebView 디버깅을 허용해 주세요."}
        </div>
      )}
    </div>
  );
}
