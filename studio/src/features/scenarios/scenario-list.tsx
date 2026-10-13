import { PageHeader } from "@/components/page-header";
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
import type { Session, NewSession } from "../../../../contracts/studio";
export function ScenarioList({
  sessions,
  onDelete,
  onSelect,
  onCreate,
  busy,
}: {
  sessions: Session[];
  onDelete: (rows: Session[]) => Promise<void>;
  onSelect: (id: string) => void;
  onCreate: (value: NewSession) => Promise<unknown>;
  busy: boolean;
}) {
  const environmentFor = (session: Session) =>
    session.engine === "android"
      ? "앱"
      : session.engine === "api"
        ? "API"
        : "웹";
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-6">
      <PageHeader
        title="시나리오"
        description="저장된 테스트의 동작을 열어 확인하고 재실행해요."
        actions={
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
            <DialogContent variant="form" showCloseButton={!busy}>
              <DialogHeader>
                <DialogTitle>새 시나리오</DialogTitle>
                <DialogDescription>
                  테스트 유형과 이름을 정하고 시나리오 작성을 시작해요.
                </DialogDescription>
              </DialogHeader>
              <TestExecution
                embedded
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
        }
      />
      <DataTable
        onDeleteRows={onDelete}
        data={sessions.filter((s) => s.steps.length > 0 || !!s.plan)}
        caption="저장된 시나리오"
        getRowId={(s) => s.id}
        getRowLabel={(s) => s.name}
        searchText={(s) => [s.name, s.url, environmentFor(s)].join(" ")}
        columns={[
          {
            id: "name",
            header: "시나리오",
            defaultWidth: 520,
            sortValue: (s) => s.name,
            cell: (s) => (
              <Button variant="link" onClick={() => onSelect(s.id)}>
                {s.name}
              </Button>
            ),
          },
          {
            id: "environment",
            header: "테스트 유형",
            sortValue: environmentFor,
            cell: environmentFor,
          },
          {
            id: "steps",
            header: "동작 수",
            sortValue: (s) => s.plan?.steps.length ?? s.steps.length,
            cell: (s) => s.plan ? `${s.plan.steps.length}단계 · 초안` : `${s.steps.length}개`,
          },
        ]}
        rowActions={(s) => [
          { label: "시나리오 열기", onSelect: () => onSelect(s.id) },
        ]}
      />
    </div>
  );
}
