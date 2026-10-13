import { Code } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { Card } from "@/components/ui/card";
import { Tabs, PanelTabsList, TabsContent } from "@/components/ui/tabs";
import { script } from "../../../../server/src/studio/domain/export";

import type { Session } from "../../../../contracts/studio";
export function DebugPanel({ session }: { session: Session }) {
  return (
    <Card variant="panel">
      <Tabs variant="flush" value="code">
        <PanelTabsList
          value="code"
          label="스튜디오 도구"
          items={[
            {
              value: "code",
              label:
                session.engine === "android"
                  ? "Appium 코드"
                  : "Playwright 코드",
              icon: <Code />,
            },
          ]}
        />
        <div className="p-3">
          <TabsContent value="code">
            <CodeBlock code={script(session)} />
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
