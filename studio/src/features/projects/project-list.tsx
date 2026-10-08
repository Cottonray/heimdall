import { Item } from "@/components/ui/item";
import { PageHeader } from "@/components/page-header";
import { useState, type ReactNode } from "react";
import { Folder, Plus, ArrowUpRight, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input, SearchInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Project } from "../../../../contracts/studio";
export function ProjectList({
  projects,
  busy,
  onEnter,
  onCreate,
  actions,
}: {
  projects: Project[];
  busy: boolean;
  actions?: ReactNode;
  onEnter: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem("heimdall-project-view") === "list"
        ? "list"
        : "cards";
    } catch {
      return "cards";
    }
  });
  const changeView = (next: "cards" | "list") => {
    setView(next);
    try {
      localStorage.setItem("heimdall-project-view", next);
    } catch {
      /* Storage may be unavailable. */
    }
  };
  const filtered = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        title="프로젝트"
        description={`${projects.length}개 프로젝트`}
        actions={
          <>
            {actions}
            <Button onClick={() => setOpen(true)}>
              <Plus />새 프로젝트
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          aria-label="프로젝트 이름 검색"
          placeholder="프로젝트 이름 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full sm:w-80"
        />
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="프로젝트 보기 방식"
        >
          <Button
            size="icon-sm"
            variant={view === "cards" ? "secondary" : "ghost"}
            aria-label="카드보기"
            title="카드보기"
            aria-pressed={view === "cards"}
            onClick={() => changeView("cards")}
          >
            <LayoutGrid />
          </Button>
          <Button
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            aria-label="목록보기"
            title="목록보기"
            aria-pressed={view === "list"}
            onClick={() => changeView("list")}
          >
            <List />
          </Button>
        </div>
      </div>
      {!filtered.length ? (
        <p
          role="status"
          className="py-8 text-center text-sm text-muted-foreground"
        >
          {query.trim() ? "검색 결과가 없어요." : "등록된 프로젝트가 없어요."}
        </p>
      ) : view === "list" ? (
        <Table variant="bordered">
          <TableHeader>
            <TableRow>
              <TableHead>프로젝트</TableHead>
              <TableHead>테스트 수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Button variant="link" onClick={() => onEnter(project.id)}>
                    <Folder />
                    {project.name}
                  </Button>
                </TableCell>
                <TableCell>{project.tests}개</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((project) => (
            <Item key={project.id} variant="project" size="project" asChild>
              <button type="button" onClick={() => onEnter(project.id)}>
                <span className="flex items-center justify-between">
                  <Folder className="size-7 text-primary" />
                  <ArrowUpRight className="size-5 text-muted-foreground group-hover:text-primary" />
                </span>
                <span className="mt-8 block truncate text-lg font-semibold">
                  {project.name}
                </span>
                <span className="mt-2 block text-sm text-muted-foreground">
                  테스트 {project.tests}개
                </span>
              </button>
            </Item>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 프로젝트</DialogTitle>
            <DialogDescription>
              프로젝트별로 테스트와 결과를 관리해요.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await onCreate(name)) {
                setOpen(false);
                setName("");
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="project-name">프로젝트 이름</Label>
              <Input
                id="project-name"
                required
                maxLength={80}
                placeholder="프로젝트 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "생성 중" : "생성"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
