import { useId, useState } from "react";
import { Sparkles, Play, Hand, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { defaultGoal } from "@/lib/labels";
import type { Session, Action } from "../../../../contracts/studio";
export function AgentPanel({
  session,
  busy,
  onCommand,
  onAction,
}: {
  session: Session;
  busy: boolean;
  onCommand: (tool: "qa_agent" | "qa_pause", goal?: string) => Promise<unknown>;
  onAction: (a: Action) => Promise<unknown>;
}) {
  const goalId = useId();
  const [goal, setGoal] = useState(session.goal || defaultGoal);
  const [expected, setExpected] = useState("");
  const closed = session.state === "closed";
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Codex 시나리오
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          이 시나리오의 테스트만 작성하고 실행해요.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Label htmlFor={goalId}>테스트 목표</Label>
          <Textarea
            id={goalId}
            rows={5}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="무엇을 검증할지 알려주세요"
            disabled={closed}
          />
          <div className="rounded-lg bg-muted p-4" role="status">
            <p className="text-sm leading-6">{session.message}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={busy || closed || session.ai || !goal.trim()}
              onClick={() => void onCommand("qa_agent", goal)}
            >
              <Play />
              {session.steps.length ? "Codex 이어서" : "Codex 실행"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || closed}
              onClick={() => void onCommand("qa_pause")}
            >
              <Hand />
              사람 개입
            </Button>
          </div>
          <Separator />
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCheck className="size-4" />
            기대 결과 확인
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void onAction({ type: "assert", text: expected });
            }}
          >
            <Input
              aria-label="기대 결과 문구"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="화면에 보여야 할 문구"
              disabled={closed}
            />
            <Button
              variant="secondary"
              className="w-full"
              disabled={
                busy ||
                closed ||
                session.state === "ai" ||
                session.state === "replay" ||
                session.working ||
                !expected.trim()
              }
              type="submit"
            >
              결과 검증
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
