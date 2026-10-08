import { useState } from "react";
import { ProfileEditor } from "@/features/auth/profile-editor";
import type { ProfileActionResult } from "@/lib/api";
import { Download, RefreshCw, UserRound, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { downloadMcp } from "@/features/integrations/mcp";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { StudioStatus, User } from "../../../../contracts/studio";
export function Settings({
  user,
  busy,
  onSaveAvatar,
  onChangePassword,
  open,
  onOpenChange,
  status,
  onRefresh,
}: {
  user: User;
  busy: boolean;
  onSaveAvatar: (avatar: string | null) => Promise<ProfileActionResult>;
  onChangePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<ProfileActionResult>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: StudioStatus | null;
  onRefresh: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="settings">
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
          <DialogDescription>계정과 MCP 연결을 관리해요.</DialogDescription>
        </DialogHeader>
        <Tabs
          defaultValue="account"
          orientation="vertical"
          className="min-h-0 flex-1"
        >
          <TabsList variant="settings" aria-label="설정 메뉴">
            <TabsTrigger value="account">
              <UserRound />
              계정설정
            </TabsTrigger>
            <TabsTrigger value="mcp">
              <Plug />
              MCP 연결
            </TabsTrigger>
          </TabsList>
          <TabsContent value="account" className="min-w-0 overflow-y-auto">
            <Card>
              <CardHeader>
                <CardTitle>프로필</CardTitle>
                <CardDescription>
                  {user.name} · {user.username}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProfileEditor
                  key={user.id}
                  user={user}
                  locked={busy || pending}
                  onPending={setPending}
                  onSaveAvatar={onSaveAvatar}
                  onChangePassword={onChangePassword}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent
            value="mcp"
            variant="settings"
          >
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
                    <dd>
                      {status?.android.booted ? "기기 연결됨" : "준비 중"}
                    </dd>
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
