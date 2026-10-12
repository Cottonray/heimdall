import { type ReactNode, useId, useState } from "react";
import { Braces, Code, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, PanelTabsList, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { script } from "../../../../server/src/studio/domain/export";

import type { Session, Action } from "../../../../contracts/studio";
export function DebugPanel({
  session,
  busy,
  onAction,
  agent,
}: {
  agent?: ReactNode;
  session: Session;
  busy: boolean;
  onAction: (a: Action) => Promise<unknown>;
}) {
  const formId = useId();
  const [tab, setTab] = useState(agent ? "agent" : "code");
  const [url, setUrl] = useState("http://127.0.0.1:8081/demo/api/accounts");
  const [contains, setContains] = useState("QA 테스트 계좌");
  const [status, setStatus] = useState("200");
  return (
    <Card variant="panel">
      <Tabs variant="flush" value={tab} onValueChange={setTab}>
        <PanelTabsList
          value={tab}
          label="스튜디오 도구"
          items={[
            ...(agent
              ? [{ value: "agent", label: "AI 시나리오", icon: <Sparkles /> }]
              : []),
            {
              value: "code",
              label:
                session.engine === "android"
                  ? "Appium 코드"
                  : "Playwright 코드",
              icon: <Code />,
            },
            { value: "api", label: "API", icon: <Braces /> },
          ]}
        />
        <div className="p-3">
          {agent && <TabsContent value="agent">{agent}</TabsContent>}
          <TabsContent value="code">
            <pre
              data-selectable
              className="overflow-auto rounded-lg bg-muted p-4 text-xs leading-6"
              aria-label="테스트 코드"
            >
              {script(session)}
            </pre>
          </TabsContent>
          <TabsContent value="api">
            <form
              className="space-y-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void onAction({
                  type: "api",
                  url,
                  status: Number(status),
                  contains,
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor={formId + "-url"}>GET 요청 주소</Label>
                <Input
                  id={formId + "-url"}
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-28 space-y-2">
                  <Label htmlFor={formId + "-status"}>기대 상태</Label>
                  <Input
                    id={formId + "-status"}
                    type="number"
                    min={100}
                    max={599}
                    required
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor={formId + "-contains"}>응답에 포함될 값</Label>
                  <Input
                    id={formId + "-contains"}
                    value={contains}
                    onChange={(e) => setContains(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    session.state === "ai" ||
                    session.state === "replay" ||
                    session.state === "closed" ||
                    session.engine === "android"
                  }
                >
                  API 검증
                </Button>
              </div>
              {session.engine === "android" && (
                <p className="text-xs text-muted-foreground">
                  API 검증은 웹 또는 API 세션에서 실행해요.
                </p>
              )}
            </form>
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
