import { cn } from "@/lib/utils";
import { useMemo } from "react";

// Match strings/comments first so their contents cannot be mistaken for code.
const tokens =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|const|let|var|async|await|return|if|else|throw|new|try|catch|finally|for|of|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;

export function CodeBlock({ code, fill = false }: { code: string; fill?: boolean }) {
  const parts = useMemo(() => {
    // Tokenize first so // inside selectors and URLs stays untouched.
    const source = code.split(tokens);
    let line = "";
    let formatted = "";
    for (let index = 0; index < source.length; index++) {
      const part = source[index];
      if (index % 2 === 1 && part.startsWith("//") && line.trim()) {
        const indent = line.match(/^\s*/)?.[0] || "";
        formatted += `${indent}${part}\n${line.trimEnd()}`;
        line = "";
      } else {
        const lines = part.split("\n");
        line += lines[0];
        for (const next of lines.slice(1)) {
          formatted += `${line}\n`;
          line = next;
        }
      }
    }
    return (formatted + line).split(tokens);
  }, [code]);
  return (
    <pre
      data-selectable
      aria-label="테스트 코드"
      className={cn("test-code min-w-0 max-w-full whitespace-pre-wrap break-words bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]", fill ? "h-full w-full overflow-auto rounded-none" : "rounded-lg")}
    >
      <code>
        {parts.map((part, index) => {
          const kind =
            index % 2 === 0
              ? undefined
              : part.startsWith("//") || part.startsWith("/*")
                ? "comment"
                : /^["'`]/.test(part)
                  ? "string"
                  : /^\d/.test(part)
                    ? "number"
                    : "keyword";
          return (
            <span key={index} data-token={kind}>
              {part}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
