import { Item } from "@/components/ui/item";
import { useState, type ReactNode } from "react";
import { Folder, Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">프로젝트</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {projects.length}개 프로젝트
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Button onClick={() => setOpen(true)}>
            <Plus />새 프로젝트
          </Button>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {projects.map((project) => (
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
