import { useMemo } from "react";

// Match strings/comments first so their contents cannot be mistaken for code.
const tokens =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|const|let|var|async|await|return|if|else|throw|new|try|catch|finally|for|of|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;

export function CodeBlock({ code }: { code: string }) {
  const parts = useMemo(() => code.split(tokens), [code]);
  return (
    <pre
      data-selectable
      aria-label="테스트 코드"
      className="test-code min-w-0 max-w-full whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs leading-6 [overflow-wrap:anywhere]"
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
