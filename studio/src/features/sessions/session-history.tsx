import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { engines } from "@/lib/labels";
import type { Session } from "../../../../contracts/studio";
export function SessionHistory({
  sessions,
  onSelect,
  onNew,
}: {
  sessions: Session[];
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">테스트 기록</h1>
        <Button onClick={onNew}>
          <Plus />새 테스트
        </Button>
      </div>
      <DataTable
        data={sessions}
        getRowId={(s) => s.id}
        getRowLabel={(s) => s.name}
        caption="테스트 기록"
        searchPlaceholder="이름 또는 유형 검색"
        searchText={(s) => s.name + " " + engines[s.engine].label}
        rowActions={(s) => [
          { label: "기록 열기", onSelect: () => onSelect(s.id) },
        ]}
        columns={[
          {
            id: "name",
            header: "테스트 이름",
            sortValue: (s) => s.name,
            cell: (s) => (
              <Button variant="link" onClick={() => onSelect(s.id)}>
                {s.name}
              </Button>
            ),
          },
          {
            id: "engine",
            header: "유형",
            sortValue: (s) => engines[s.engine].label,
            cell: (s) => engines[s.engine].label,
          },
          {
            id: "steps",
            header: "동작",
            sortValue: (s) => s.steps.length,
            cell: (s) => `${s.steps.length}개`,
          },
          {
            id: "state",
            header: "상태",
            sortValue: (s) => s.state,
            cell: (s) => <StatusBadge state={s.state} />,
          },
          {
            id: "updated",
            header: "최근 실행",
            sortValue: (s) => s.updated,
            cell: (s) => new Date(s.updated).toLocaleString("ko-KR"),
          },
        ]}
      />
    </div>
  );
}
