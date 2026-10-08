import { useId, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
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
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>프로젝트 이름</CardTitle>
          <CardDescription>
            프로젝트 목록과 워크스페이스에 표시할 이름이에요.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>프로젝트 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">생성일</dt>
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
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">테스트 수</dt>
              <dd>{project.tests.toLocaleString("ko-KR")}개</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectSettings({ project, ...props }: ProjectSettingsProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">프로젝트 설정</h1>
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
