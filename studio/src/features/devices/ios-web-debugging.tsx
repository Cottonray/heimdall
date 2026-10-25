import { useRef, useState } from "react";
import { RefreshCw } from "@/components/ui/material-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API } from "@/lib/api";
import type { useWebViews } from "./webview-debugging";

export function IosWebDebugging({
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
  const [expression, setExpression] = useState("document.title");
  const [output, setOutput] = useState<{ target: string; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const target =
    discovery.targets.find((t) => t.id === selected) || discovery.targets[0];
  const identity = `${serial}/${viewerId}/${target?.id}`;
  async function run(operation: "dom" | "evaluate" | "resources") {
    if (!target || !canControl || busy) return;
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${API}/ios-web-debug?${new URLSearchParams({ serial, viewer: viewerId })}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: target.id, operation, expression }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = (await response.json()) as {
        result?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "웹 디버깅을 실행하지 못했어요.");
      if (request === generation.current)
        setOutput({ target: identity, text: data.result || "undefined" });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "웹 디버깅 연결을 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Select
          value={target?.id || ""}
          onValueChange={setSelected}
          disabled={!discovery.targets.length || busy}
        >
          <SelectTrigger
            aria-label="디버깅할 iOS 웹페이지"
            className="min-w-0 flex-1"
          >
            <SelectValue placeholder="감지된 웹뷰 없음" />
          </SelectTrigger>
          <SelectContent>
            {discovery.targets.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title || item.url || item.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          aria-label="iOS 웹뷰 새로고침"
          onClick={discovery.refresh}
          disabled={discovery.loading || busy}
        >
          <RefreshCw />
        </Button>
      </div>
      <p className="truncate text-xs text-muted-foreground" title={target?.url}>
        {target?.url ||
          "Safari에서 웹페이지를 열거나 WKWebView의 isInspectable을 활성화한 뒤 새로고침해 주세요."}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={!canControl || !target || busy}
          onClick={() => void run("dom")}
        >
          DOM
        </Button>
        <Button
          variant="outline"
          disabled={!canControl || !target || busy}
          onClick={() => void run("resources")}
        >
          리소스
        </Button>
      </div>
      <Textarea
        aria-label="iOS JavaScript 표현식"
        value={expression}
        onChange={(e) => setExpression(e.target.value)}
        maxLength={10000}
        placeholder="document.querySelector('h1')?.textContent"
        disabled={!canControl || busy}
      />
      <Button
        disabled={!canControl || !target || busy || !expression.trim()}
        onClick={() => void run("evaluate")}
      >
        {busy ? "실행 중" : "실행"}
      </Button>
      {(error || discovery.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || discovery.error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        선택한 페이지에서 JavaScript를 실행해요. 리소스는 페이지가 수집한 요청
        시간·크기를 표시해요.
      </p>
      <Textarea
        aria-label="iOS 웹 디버깅 결과"
        readOnly
        value={canControl && output?.target === identity ? output.text : ""}
        variant="output" className="min-h-0 flex-1"
      />
    </div>
  );
}
