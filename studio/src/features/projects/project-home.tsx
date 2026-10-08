import { Skeleton } from "@/components/ui/skeleton";
import { Profile } from "@/features/auth/profile";
import { Dashboard } from "@/features/dashboard/dashboard";
import type { ProfileActionResult } from "@/lib/api";
import { ProjectList } from "./project-list";
import type { Session, StudioStatus, User } from "../../../../contracts/studio";

export function ProjectHome({
  status,
  sessions,
  user,
  busy,
  loading,
  onEnter,
  onCreate,
  onLogout,
  onSaveAvatar,
  onChangePassword,
}: {
  status: StudioStatus | null;
  sessions: Session[];
  user: User | null;
  busy: boolean;
  loading: boolean;
  onEnter: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onLogout: () => Promise<unknown>;
  onSaveAvatar: (avatar: string | null) => Promise<ProfileActionResult>;
  onChangePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<ProfileActionResult>;
}) {
  return (
    <div className="space-y-10">
      <ProjectList
        projects={status?.projects || []}
        busy={busy}
        onEnter={onEnter}
        onCreate={onCreate}
        actions={
          <Profile
            user={user}
            busy={busy}
            onLogout={onLogout}
            onSaveAvatar={onSaveAvatar}
            onChangePassword={onChangePassword}
          />
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
    </div>
  );
}
