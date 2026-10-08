import { useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Row = { key: string; value: string };
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
  const [mode, setMode] = useState("json");
  const [rows, setRows] = useState<Row[]>([]);
  const [rowError, setRowError] = useState("");
  const parseError = jsonError(value);
  const parsed = parseError ? null : JSON.parse(value);
  const isObject =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  const updateRows = (next: Row[]) => {
    setRows(next);
    let error = "";
    const keys = new Set<string>();
    for (const [index, row] of next.entries()) {
      if (keys.has(row.key)) {
        error = `${index + 1}행의 키가 중복돼요.`;
        break;
      }
      keys.add(row.key);
      const invalid = jsonError(row.value);
      if (invalid) {
        error = `${index + 1}행: ${invalid}`;
        break;
      }
    }
    setRowError(error);
    onValidityChange(!error);
    if (!error)
      onChange(
        JSON.stringify(
          Object.fromEntries(
            next.map((row) => [row.key, JSON.parse(row.value)]),
          ),
          null,
          2,
        ),
      );
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">추가 데이터</p>
      <Tabs
        value={mode}
        onValueChange={(next) => {
          if (next === "table")
            setRows(
              Object.entries(parsed).map(([key, item]) => ({
                key,
                value: JSON.stringify(item),
              })),
            );
          setMode(next);
        }}
      >
        <TabsList aria-label="추가 데이터 편집 방식">
          <TabsTrigger value="json" disabled={!!rowError}>
            JSON
          </TabsTrigger>
          <TabsTrigger value="table" disabled={!isObject || !!parseError}>
            테이블
          </TabsTrigger>
        </TabsList>
        <TabsContent value="json">
          <p className="mb-2 text-xs text-muted-foreground">
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
                  value.slice(0, lineStart) +
                  replacement +
                  value.slice(blockEnd);
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
                if (input.isConnected)
                  input.setSelectionRange(nextStart, nextEnd);
              });
            }}
            onChange={(event) => {
              onChange(event.target.value);
              onValidityChange(!jsonError(event.target.value));
            }}
            className="font-mono"
          />
          {!parseError && !isObject && (
            <p className="mt-2 text-xs text-muted-foreground">
              테이블 편집은 객체 형식에서 사용할 수 있어요. 배열과 단일 값은
              JSON으로 편집해 주세요.
            </p>
          )}
        </TabsContent>
        <TabsContent value="table" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            값은 JSON 형식으로 입력해 주세요. 문자열은 "문자", 숫자는 123,
            배열은 []로 입력해요.
          </p>
          <div className="max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">키</th>
                  <th className="p-2 text-left">값 (JSON)</th>
                  <th>
                    <span className="sr-only">삭제</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="p-1">
                      <Input
                        aria-label={`${index + 1}행 키`}
                        value={row.key}
                        onChange={(event) =>
                          updateRows(
                            rows.map((r, i) =>
                              i === index
                                ? { ...r, key: event.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        aria-label={`${index + 1}행 값`}
                        value={row.value}
                        onChange={(event) =>
                          updateRows(
                            rows.map((r, i) =>
                              i === index
                                ? { ...r, value: event.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`${index + 1}행 삭제`}
                        onClick={() =>
                          updateRows(rows.filter((_, i) => i !== index))
                        }
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => updateRows([...rows, { key: "", value: '\"\"' }])}
          >
            행 추가
          </Button>
        </TabsContent>
      </Tabs>
      {(rowError || parseError) && (
        <p
          id="data-json-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {rowError || parseError}
        </p>
      )}
    </div>
  );
}
