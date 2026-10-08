import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";

export function jsonError(value: string) {
  try {
    JSON.parse(value);
    return "";
  } catch (error) {
    return `JSON 형식을 확인해 주세요. ${error instanceof Error ? error.message : "파싱에 실패했어요."}`;
  }
}
export function JsonDataEditor({
  value,
  onChange,
  onValidityChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const releaseTab = useRef(false);
  const parseError = jsonError(value);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">추가 데이터 (JSON)</p>
      <p className="text-xs text-muted-foreground">
        Tab 들여쓰기 · Shift+Tab 내어쓰기 · Esc 다음 Tab으로 입력창 이동
      </p>
      <Textarea
        aria-label="추가 데이터 JSON"
        aria-invalid={!!parseError}
        aria-describedby={parseError ? "data-json-error" : undefined}
        rows={6}
        maxLength={50000}
        value={value}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            releaseTab.current = true;
            event.stopPropagation();
            return;
          }
          if (
            event.key !== "Tab" ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          ) {
            releaseTab.current = false;
            return;
          }
          if (releaseTab.current) {
            releaseTab.current = false;
            return;
          }
          event.preventDefault();
          const input = event.currentTarget;
          const start = input.selectionStart,
            end = input.selectionEnd;
          let next: string, nextStart: number, nextEnd: number;
          if (!event.shiftKey && start === end) {
            next = value.slice(0, start) + "  " + value.slice(end);
            nextStart = nextEnd = start + 2;
          } else {
            const lineStart = value.lastIndexOf("\n", start - 1) + 1;
            const blockEnd =
              end > start && value[end - 1] === "\n" ? end - 1 : end;
            const lines = value.slice(lineStart, blockEnd).split("\n");
            const deltas: number[] = [];
            const replacement = lines
              .map((line) => {
                if (!event.shiftKey) {
                  deltas.push(2);
                  return "  " + line;
                }
                const count = line.startsWith("\t")
                  ? 1
                  : line.match(/^ {1,2}/)?.[0].length || 0;
                deltas.push(-count);
                return line.slice(count);
              })
              .join("\n");
            next =
              value.slice(0, lineStart) + replacement + value.slice(blockEnd);
            nextStart = Math.max(lineStart, start + deltas[0]);
            nextEnd = Math.max(
              nextStart,
              end + deltas.reduce((sum, delta) => sum + delta, 0),
            );
          }
          if (next.length > 50000) return;
          onChange(next);
          onValidityChange(!jsonError(next));
          requestAnimationFrame(() => {
            if (input.isConnected) input.setSelectionRange(nextStart, nextEnd);
          });
        }}
        onChange={(event) => {
          onChange(event.target.value);
          onValidityChange(!jsonError(event.target.value));
        }}
        variant="code"
      />
      {parseError && (
        <p
          id="data-json-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {parseError}
        </p>
      )}
    </div>
  );
}
