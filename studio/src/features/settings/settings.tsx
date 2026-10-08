import { Sun, Moon, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { downloadMcp } from "@/features/integrations/mcp";
import type { Theme } from "./use-theme";
import type { StudioStatus } from "../../../../contracts/studio";
export function Settings({
  theme,
  onTheme,
  status,
  onRefresh,
}: {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  status: StudioStatus | null;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>화면 테마</CardTitle>
            <CardDescription>
              이 브라우저에 선택한 테마를 저장해요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                aria-pressed={theme === "light"}
                onClick={() => onTheme("light")}
              >
                <Sun />
                라이트
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                aria-pressed={theme === "dark"}
                onClick={() => onTheme("dark")}
              >
                <Moon />
                다크
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MCP 연결</CardTitle>
            <CardDescription>
              AI 도구에서 헤임달의 테스트를 실행해요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={downloadMcp}>
              <Download />
              연결 설정 다운로드
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>실행 환경</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">브라우저</dt>
                <dd>
                  {status?.browser.ok
                    ? `${status.browser.active ?? 0} / ${status.browser.capacity ?? 2} 사용 중`
                    : "연결 확인 필요"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Android</dt>
                <dd>{status?.android.booted ? "기기 연결됨" : "준비 중"}</dd>
              </div>
            </dl>
            <div className="mt-6">
              <Button variant="outline" onClick={onRefresh}>
                <RefreshCw />
                새로고침
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
