import assert from "node:assert/strict";
import { ESLint } from "eslint";
const eslint = new ESLint();
const [result] = await eslint.lintText(
  `import { Button } from '@/components/ui/button'; export function Invalid(){return <Button className="bg-red-500 p-[13px] unknown-qa-class" style={{color:'red'}}>검사</Button>}`,
  { filePath: "src/lint-contract.tsx" },
);
for (const rule of [
  "shadcn/no-raw-colors",
  "shadcn/no-arbitrary-values",
  "shadcn/no-inline-styles",
  "shadcn/no-unknown-classes",
  "shadcn/no-restyle",
])
  assert.ok(
    result.messages.some((m) => m.ruleId === rule),
    rule + " must reject invalid design",
  );
console.log(
  "PASS: shadcn lint rejects raw colors, arbitrary values, inline styles, unknown classes and component restyling",
);
