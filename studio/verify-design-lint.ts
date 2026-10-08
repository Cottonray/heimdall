import assert from "node:assert/strict";
import { ESLint } from "eslint";

const eslint = new ESLint();
const screenPath = "src/features/lint-contract.tsx";
const render = (jsx: string, imports = "", argument = "") =>
  `${imports} export function Example(${argument}) { return (${jsx}); }`;

const rejected = [
  ["shadcn/no-raw-colors", render('<div className="bg-red-500" />')],
  ["shadcn/no-raw-colors", render('<svg><path fill="#f00" /></svg>')],
  ["shadcn/no-arbitrary-values", render('<div className="p-[13px]" />')],
  ["shadcn/no-inline-styles", render('<div style={{ color: "red" }} />')],
  ["shadcn/no-unknown-classes", render('<div className="unknown-qa-class" />')],
  [
    "shadcn/no-restyle",
    render(
      '<Button className="p-4">검사</Button>',
      'import { Button } from "@/components/ui/button";',
    ),
  ],
  [
    "shadcn/no-restyle",
    render(
      '<Input className="pl-9" aria-label="검색" />',
      'import { Input } from "@/components/ui/input";',
    ),
  ],
  [
    "shadcn/no-restyle",
    render(
      '<Item className="bg-primary" />',
      'import { Item } from "@/components/ui/item";',
    ),
  ],
  [
    "shadcn/no-restyle",
    render(
      '<SelectTrigger className="p-4" aria-label="화면 테마" />',
      'import { SelectTrigger } from "@/components/ui/select";',
    ),
  ],
  [
    "shadcn/require-static-classes",
    render(
      "<Button className={appearance}>검사</Button>",
      'import { Button } from "@/components/ui/button";',
      "{ appearance }: { appearance: string }",
    ),
  ],
  ["no-restricted-syntax", render('<input aria-label="이름" />')],
  ["no-restricted-syntax", render('<button className="p-4">검사</button>')],
  [
    "shadcn/no-raw-colors",
    "/* eslint-disable shadcn/no-raw-colors */\n" +
      render('<div className="bg-red-500" />'),
  ],
] as const;

for (const [rule, code] of rejected) {
  const [result] = await eslint.lintText(code, { filePath: screenPath });
  assert.ok(
    result.messages.some((m) => m.ruleId === rule),
    `${rule} must reject: ${code}`,
  );
}

// UI implementation exceptions must never disable color or inline-style rules.
for (const [rule, code] of rejected
  .slice(0, 4)
  .filter(([rule]) => rule !== "shadcn/no-arbitrary-values")) {
  const [result] = await eslint.lintText(code, {
    filePath: "src/components/ui/lint-contract.tsx",
  });
  assert.ok(
    result.messages.some((m) => m.ruleId === rule),
    `${rule} must remain active inside shared UI`,
  );
}

const accepted = render(
  `<div className="grid gap-4 bg-background text-foreground">
    <Button variant="outline" size="sm" className="w-full">버튼</Button>
    <Item variant="project" size="project" asChild><button type="button">프로젝트</button></Item>
    <SearchInput aria-label="검색" />
    <StatusDot state="ready" label="조작 가능" />
    <Switch aria-label="다크 모드" size="sm" checked={false} />
    <Label variant="subtle">시스템 설정 따르기</Label>
    <SelectTrigger direction="up" variant="ghost" className="w-full" aria-label="화면 테마" />
    <WorkspaceTab value="board" label="워크스페이스" icon={null} active onClose={() => {}} />
    <DialogContent variant="settings"><TabsList variant="settings" /><TabsContent value="device" variant="remote" /><TabsContent value="mcp" variant="settings" /></DialogContent>
    <Card variant="plain" /><DropdownMenuContent variant="profile" /><Button size="avatar" aria-label="프로필 이미지" />
    <Textarea variant="output" aria-label="결과" /><Textarea variant="code" aria-label="코드" />
    <Tabs variant="flush"><TabsList variant="inspector" /></Tabs>
    <Button variant="refresh">새로고침</Button><Button variant="notification" size="icon" aria-label="알림" />
    <Button variant="danger-ghost" size="icon-sm" aria-label="닫기" /><Button variant="cell" size="fill" aria-label="셀" />
    <SelectTrigger variant="refresh" aria-label="주기" /><DialogContent variant="download" />
    <TableRow variant="static"><TableCell variant="action" /></TableRow><Card variant="panel" /><Card variant="preview" /><CardHeader variant="compact" /><CardFooter variant="compact" /><CardContent variant="compact" /><SelectTrigger variant="multiline" /><DialogContent variant="form" /><CardContent variant="stack" />
    <svg><path fill="var(--primary)" /></svg>
  </div>`,
  `import { Button } from "@/components/ui/button";
   import { Card, CardContent } from "@/components/ui/card";
   import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
   import { Item } from "@/components/ui/item";
   import { StatusDot } from "@/components/ui/status-dot";
   import { SearchInput } from "@/components/ui/input";
   import { Switch } from "@/components/ui/switch";
   import { Label } from "@/components/ui/label";
   import { SelectTrigger } from "@/components/ui/select";
   import { WorkspaceTab, Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
   import { DialogContent } from "@/components/ui/dialog";
   import { Textarea } from "@/components/ui/textarea";
   import { TableRow, TableCell } from "@/components/ui/table";`,
);
const [valid] = await eslint.lintText(accepted, { filePath: screenPath });
assert.equal(valid.errorCount, 0, JSON.stringify(valid.messages));
assert.equal(valid.warningCount, 0, JSON.stringify(valid.messages));
console.log(
  "PASS: all 6 shadcn rules, shared-control boundaries and UI exceptions reject regressions; standard variants and tokens pass",
);
