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
    <div className="mx-auto max-w-5xl py-12">
      <p className="text-sm font-medium text-primary">
        한곳에서 작성하고, 실행하고, 검증해요
      </p>
      <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
        AI와 함께 완성하는
        <br />
        테스트 시나리오
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
        목표를 알려주고 실행을 지켜보세요. 필요한 순간 직접 조작하면
        <br className="hidden md:block" /> AI가 그 맥락을 이어받아 하나의
        시나리오로 완성해요.
      </p>
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
