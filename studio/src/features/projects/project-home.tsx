import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Profile } from "@/features/auth/profile";
import { Dashboard } from "@/features/dashboard/dashboard";
import { Settings } from "@/features/settings/settings";
import type { Theme } from "@/features/settings/use-theme";
import { ProjectList } from "./project-list";
import type { Session, StudioStatus, User } from "../../../../contracts/studio";

export function ProjectHome({
  status,
  sessions,
  user,
  busy,
  loading,
  theme,
  onTheme,
  onEnter,
  onCreate,
  onLogout,
  onRefresh,
}: {
  status: StudioStatus | null;
  sessions: Session[];
  user: User | null;
  busy: boolean;
  loading: boolean;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onEnter: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onLogout: () => Promise<unknown>;
  onRefresh: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="space-y-10">
      <ProjectList
        projects={status?.projects || []}
        busy={busy}
        onEnter={onEnter}
        onCreate={onCreate}
        actions={
          <>
            <Profile user={user} busy={busy} onLogout={onLogout} />
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
              설정
            </Button>
          </>
        }
      />
      {loading ? (
        <div
          className="space-y-4"
          aria-label="테스트 현황 불러오는 중"
          aria-busy="true"
        >
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <Dashboard sessions={sessions} overview />
      )}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-160 overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>프로젝트 환경 설정</DialogTitle>
            <DialogDescription>테마와 연결 환경을 관리해요.</DialogDescription>
          </DialogHeader>
          <Settings
            theme={theme}
            onTheme={onTheme}
            status={status}
            onRefresh={onRefresh}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
