import { useState } from "react";
import { ProfileEditor } from "@/features/auth/profile-editor";
import type { ProfileActionResult } from "@/lib/api";
import { Download, UserRound, Plug } from "lucide-react";
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
import type { User } from "../../../../contracts/studio";
export function Settings({
  user,
  busy,
  onSaveAvatar,
  onChangePassword,
  open,
  onOpenChange,
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
          <TabsContent value="account" variant="settings">
            <Card variant="plain">
              <CardHeader>
                <CardTitle>프로필</CardTitle>
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
          <TabsContent value="mcp" variant="settings">
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
