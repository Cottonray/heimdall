import { useState } from "react";
import { ProfileEditor } from "@/features/auth/profile-editor";
import type { ProfileActionResult } from "@/lib/api";
import { Download, UserRound, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadMcp } from "@/features/integrations/mcp";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
      <DialogContent variant="settings" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
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
            <section className="space-y-5 px-1 py-2">
              <h2 className="text-base font-semibold">프로필</h2>
                <ProfileEditor
                  key={user.id}
                  user={user}
                  locked={busy || pending}
                  onPending={setPending}
                  onSaveAvatar={onSaveAvatar}
                  onChangePassword={onChangePassword}
                />
            </section>
          </TabsContent>
          <TabsContent value="mcp" variant="settings">
            <section className="space-y-5 px-1 py-2">
              <header className="space-y-2">
                <h2 className="text-base font-semibold">MCP 연결</h2>
                <p className="text-sm text-muted-foreground">
                  AI 도구에서 헤임달의 테스트를 실행해요.
                </p>
              </header>
              <Button variant="outline" onClick={downloadMcp}>
                <Download />
                연결 설정 다운로드
              </Button>
            </section>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
