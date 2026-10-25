import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
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
import { Save } from "@/components/ui/material-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Project, ProjectRepository } from "../../../../contracts/studio";

type ProjectSettingsProps = {
  project: Project | null;
  busy: boolean;
  onSave: (
    name: string,
    source: Pick<Project, "repositories" | "description" | "appPackage">,
  ) => Promise<boolean>;
};

function ProjectSettingsForm({
  project,
  busy,
  onSave,
}: Omit<ProjectSettingsProps, "project"> & { project: Project }) {
  const nameId = useId();
  const [name, setName] = useState(project.name);
  const initialRepositories =
    project.repositories ??
    (project.sourceUrl
      ? [
          {
            sourceType: project.sourceType || "git",
            sourceUrl: project.sourceUrl,
            description: "",
          },
        ]
      : []);
  const [repositories, setRepositories] =
    useState<ProjectRepository[]>(initialRepositories);
  const updateRepository = (
    index: number,
    patch: Partial<ProjectRepository>,
  ) => {
    setRepositories((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    setSaved(false);
  };
  const [description, setDescription] = useState(project.description || "");
  const [appPackage, setAppPackage] = useState(project.appPackage || "");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const locked = busy || pending;
  const changed =
    name.trim() !== project.name ||
    appPackage.trim() !== (project.appPackage || "") ||
    JSON.stringify(repositories) !== JSON.stringify(initialRepositories) ||
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
        <div className="min-w-0">
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
                    repositories,
                    appPackage: appPackage.trim(),
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
              <Label htmlFor={nameId + "-app-package"}>Android 앱 패키지</Label>
              <Input id={nameId + "-app-package"} value={appPackage} maxLength={200} disabled={locked}
                placeholder="com.example.demo"
                onChange={(e) => { setAppPackage(e.target.value); setSaved(false); }} />
              <p className="text-sm text-muted-foreground">앱 테스트를 열 때 실행할 설치된 앱이에요. 비워두면 기본 앱을 사용해요.</p>
            </div>
            <section className="space-y-3" aria-label="참고 저장소">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">참고 저장소</h2>
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked || repositories.length >= 5}
                  onClick={() => {
                    setRepositories((rows) => [
                      ...rows,
                      { sourceType: "git", sourceUrl: "", description: "" },
                    ]);
                    setSaved(false);
                  }}
                >
                  추가
                </Button>
              </div>
              <Table variant="bordered" columnWidths={[120, 320, 320, 80]}>
                <TableHeader>
                  <TableRow>
                    <TableHead>종류</TableHead>
                    <TableHead>저장소 주소</TableHead>
                    <TableHead>설명</TableHead>
                    <TableHead>관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repositories.map((repository, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          value={repository.sourceType}
                          disabled={locked}
                          onValueChange={(value) =>
                            updateRepository(index, {
                              sourceType: value as "git" | "svn",
                            })
                          }
                        >
                          <SelectTrigger
                            className="w-full"
                            aria-label={`저장소 ${index + 1} 종류`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="git">Git</SelectItem>
                            <SelectItem value="svn">SVN</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`저장소 ${index + 1} 주소`}
                          type="url"
                          required
                          maxLength={2000}
                          disabled={locked}
                          value={repository.sourceUrl}
                          onChange={(event) =>
                            updateRepository(index, {
                              sourceUrl: event.target.value,
                            })
                          }
                          placeholder="https://github.com/organization/repository.git"
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          aria-label={`저장소 ${index + 1} 설명`}
                          maxLength={5000}
                          disabled={locked}
                          value={repository.description}
                          onChange={(event) =>
                            updateRepository(index, {
                              description: event.target.value,
                            })
                          }
                          placeholder="역할과 AI가 참고할 기능을 적어 주세요."
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={locked}
                          aria-label={`저장소 ${index + 1} 삭제`}
                          onClick={() => {
                            setRepositories((rows) =>
                              rows.filter((_, i) => i !== index),
                            );
                            setSaved(false);
                          }}
                        >
                          삭제
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!repositories.length && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        등록된 저장소가 없어요. 추가 버튼으로 등록해 주세요.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="text-sm text-muted-foreground">
                최대 5개의 저장소를 참고해요. 저장소별 설명과 소스 일부가 AI
                설정의 모델에 전달돼요. 인증정보 없는 공개 HTTPS 주소를 사용해
                주세요.
              </p>
            </section>
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
