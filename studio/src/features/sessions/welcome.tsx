import {
  Monitor,
  Smartphone,
  Braces,
  Plus,
  Workflow,
  MousePointer2,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { engines } from "@/lib/labels";
import type { Engine } from "../../../../contracts/studio";
export function Welcome({ onNew }: { onNew: () => void }) {
  return (
    <div className="mx-auto max-w-5xl py-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        새 테스트
      </h1>
      <div className="my-8">
        <Button size="lg" onClick={onNew}>
          <Plus />새 테스트
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(engines) as Engine[]).map((key) => {
          const Icon =
            key === "web" ? Monitor : key === "api" ? Braces : Smartphone;
          return (
            <Card key={key}>
              <CardContent>
                <Icon className="mb-5 size-5 text-primary" />
                <h2 className="font-semibold">{engines[key].label}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {engines[key].description}
                </p>
                <p className="mt-5 text-xs text-muted-foreground">
                  {engines[key].tool}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-7 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Workflow className="size-4" />
          AI 시나리오 작성
        </span>
        <span className="flex items-center gap-2">
          <MousePointer2 className="size-4" />
          사람 개입 기록
        </span>
        <span className="flex items-center gap-2">
          <CheckCheck className="size-4" />
          증적 저장 · 재실행
        </span>
      </div>
    </div>
  );
}
