import { useState } from "react";
import { FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Project } from "../../../../contracts/studio";
export function MoveTestDialog({
  projects,
  current,
  busy,
  onMove,
}: {
  projects: Project[];
  current: string;
  busy: boolean;
  onMove: (id: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        <FolderInput />
        프로젝트 이동
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로젝트 이동</DialogTitle>
            <DialogDescription>
              이 테스트를 보관할 프로젝트를 선택해 주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {projects
              .filter((p) => p.id !== current)
              .map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  className="w-full justify-start"
                  disabled={busy}
                  onClick={async () => {
                    if (await onMove(p.id)) setOpen(false);
                  }}
                >
                  <FolderInput />
                  {p.name}
                </Button>
              ))}
            {projects.length < 2 && (
              <p className="text-sm text-muted-foreground">
                프로젝트 목록에서 새 프로젝트를 만들어 주세요.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
