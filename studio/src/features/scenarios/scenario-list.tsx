import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TestExecution } from "@/features/sessions/test-execution";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { engines } from "@/lib/labels";
import type { Session, Domain, NewSession } from "../../../../contracts/studio";
export function ScenarioList({
  sessions,
  onDelete,
  onSelect,
  onCreate,
  domains,
  busy,
}: {
  sessions: Session[];
  onDelete: (rows: Session[]) => Promise<void>;
  onSelect: (id: string) => void;
  onCreate: (value: NewSession) => Promise<unknown>;
  domains: Domain[];
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">시나리오</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            저장된 테스트의 동작을 열어 확인하고 재실행해요.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!busy) {
              setOpen(value);
              setError("");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus />새 시나리오
            </Button>
          </DialogTrigger>
          <DialogContent
            variant="form"
            showCloseButton={!busy}
          >
            <DialogHeader>
              <DialogTitle>새 시나리오</DialogTitle>
              <DialogDescription>
                실행환경과 이름을 정하고 시나리오 작성을 시작해요.
              </DialogDescription>
            </DialogHeader>
            <TestExecution
              embedded
              domains={domains}
              busy={busy}
              onCreate={async (value) => {
                setError("");
                const result = await onCreate(value);
                if (result) setOpen(false);
                else
                  setError(
                    "시나리오를 시작하지 못했어요. 연결 상태와 입력을 확인해 주세요.",
                  );
                return result;
              }}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        onDeleteRows={onDelete}
        data={sessions.filter((s) => s.steps.length > 0)}
        caption="저장된 시나리오"
        getRowId={(s) => s.id}
        getRowLabel={(s) => s.name}
        searchText={(s) => s.name}
        columns={[
          {
            id: "name",
            header: "시나리오",
            sortValue: (s) => s.name,
            cell: (s) => (
              <Button variant="link" onClick={() => onSelect(s.id)}>
                {s.name}
              </Button>
            ),
          },
          {
            id: "type",
            header: "유형",
            sortValue: (s) => s.engine,
            cell: (s) => engines[s.engine].label,
          },
          {
            id: "steps",
            header: "동작 수",
            sortValue: (s) => s.steps.length,
            cell: (s) => `${s.steps.length}개`,
          },
        ]}
        rowActions={(s) => [
          { label: "시나리오 열기", onSelect: () => onSelect(s.id) },
        ]}
      />
    </div>
  );
}
