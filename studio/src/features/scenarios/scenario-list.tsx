import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { engines } from "@/lib/labels";
import type { Session } from "../../../../contracts/studio";
export function ScenarioList({
  sessions,
  onSelect,
  onNew,
}: {
  sessions: Session[];
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">시나리오</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            저장된 테스트의 동작을 열어 확인하고 재실행해요.
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus />새 시나리오
        </Button>
      </div>
      <DataTable
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
