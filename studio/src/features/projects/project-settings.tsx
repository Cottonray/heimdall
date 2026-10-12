import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  onSave: (
    name: string,
    source: Pick<Project, "sourceType" | "sourceUrl" | "description">,
  ) => Promise<boolean>;
};

function ProjectSettingsForm({
  project,
  busy,
  onSave,
}: Omit<ProjectSettingsProps, "project"> & { project: Project }) {
  const nameId = useId();
  const [name, setName] = useState(project.name);
  const [sourceType, setSourceType] = useState<"git" | "svn">(
    project.sourceType || "git",
  );
  const [sourceUrl, setSourceUrl] = useState(project.sourceUrl || "");
  const [description, setDescription] = useState(project.description || "");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const locked = busy || pending;
  const changed =
    name.trim() !== project.name ||
    sourceType !== (project.sourceType || "git") ||
    sourceUrl.trim() !== (project.sourceUrl || "") ||
    description.trim() !== (project.description || "");
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
                if (
                  await onSave(name.trim(), {
                    sourceType,
                    sourceUrl: sourceUrl.trim(),
                    description: description.trim(),
                  })
                ) {
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
            <div className="space-y-2">
              <Label htmlFor={nameId + "-description"}>프로젝트 설명</Label>
              <Textarea
                id={nameId + "-description"}
                value={description}
                maxLength={5000}
                disabled={locked}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setSaved(false);
                }}
                placeholder="주요 기능과 테스트할 업무 흐름을 적어 주세요."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={nameId + "-type"}>저장소 종류</Label>
              <Select
                value={sourceType}
                disabled={locked}
                onValueChange={(value) => {
                  setSourceType(value as "git" | "svn");
                  setSaved(false);
                }}
              >
                <SelectTrigger id={nameId + "-type"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="git">Git</SelectItem>
                  <SelectItem value="svn">SVN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={nameId + "-source"}>저장소 주소</Label>
              <Input
                id={nameId + "-source"}
                type="url"
                value={sourceUrl}
                maxLength={2000}
                disabled={locked}
                onChange={(e) => {
                  setSourceUrl(e.target.value);
                  setSaved(false);
                }}
                placeholder="https://github.com/organization/repository.git"
              />
              <p className="text-sm text-muted-foreground">
                시나리오 작성 시 소스를 읽기 전용으로 참고해요. 설명과 소스
                일부가 AI 설정의 모델에 전달돼요. 인증정보는 주소에 넣지 마세요.
                비공개·사내 저장소는 서버 연결 설정이 필요해요.
              </p>
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
                  프로젝트 설정을 저장했어요.
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
