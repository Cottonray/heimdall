import { PageHeader } from "@/components/page-header";
import { useId, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Project } from "../../../../contracts/studio";

type ProjectSettingsProps = {
  project: Project | null;
  busy: boolean;
  onSave: (name: string) => Promise<boolean>;
};

function ProjectSettingsForm({
  project,
  busy,
  onSave,
}: Omit<ProjectSettingsProps, "project"> & { project: Project }) {
  const nameId = useId();
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const locked = busy || pending;
  const changed = name.trim() !== project.name;
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">프로젝트 이름</h2>
          <p className="text-sm text-muted-foreground">
            프로젝트 목록과 워크스페이스에 표시할 이름이에요.
          </p>
        </header>
        <div className="max-w-xl">
          <form
            className="space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (locked || !name.trim() || !changed) return;
              setPending(true);
              setSaved(false);
              try {
                if (await onSave(name.trim())) {
                  setName(name.trim());
                  setSaved(true);
                }
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={nameId}>이름</Label>
              <Input
                id={nameId}
                value={name}
                required
                maxLength={80}
                disabled={locked}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={locked || !name.trim() || !changed}
              >
                <Save />
                {pending ? "저장 중" : "저장"}
              </Button>
              {saved && (
                <p role="status" className="text-sm text-success">
                  프로젝트 이름을 저장했어요.
                </p>
              )}
            </div>
          </form>
        </div>
      </section>
      <section className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">프로젝트 정보</h2>
        </header>
        <div className="max-w-xl">
          <dl className="space-y-4 text-sm">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">생성일</dt>
              <dd>
                <time dateTime={project.created}>
                  {new Date(project.created).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">테스트 수</dt>
              <dd>{project.tests.toLocaleString("ko-KR")}개</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

export function ProjectSettings({ project, ...props }: ProjectSettingsProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="프로젝트 설정" />
      {project ? (
        <ProjectSettingsForm key={project.id} project={project} {...props} />
      ) : (
        <p className="text-sm text-muted-foreground">
          프로젝트를 선택해 주세요.
        </p>
      )}
    </div>
  );
}
