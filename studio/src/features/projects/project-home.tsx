import { ProjectList } from "./project-list";
import type { StudioStatus } from "../../../../contracts/studio";

export function ProjectHome({
  status,
  busy,
  onEnter,
  onCreate,
}: {
  status: StudioStatus | null;
  busy: boolean;
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
    </div>
  );
}
