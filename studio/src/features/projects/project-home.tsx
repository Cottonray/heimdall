import { Skeleton } from "@/components/ui/skeleton";
import { Dashboard } from "@/features/dashboard/dashboard";
import { ProjectList } from "./project-list";
import type { Session, StudioStatus } from "../../../../contracts/studio";

export function ProjectHome({
  status,
  sessions,
  busy,
  loading,
  onEnter,
  onCreate,
}: {
  status: StudioStatus | null;
  sessions: Session[];
  busy: boolean;
  loading: boolean;
  onEnter: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
}) {
  return (
    <div className="space-y-10">
      <ProjectList
        projects={status?.projects || []}
        busy={busy}
        onEnter={onEnter}
        onCreate={onCreate}
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
