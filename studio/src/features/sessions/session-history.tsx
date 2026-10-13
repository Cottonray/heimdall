import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { engines, runStatus } from "@/lib/labels";
import type { Session } from "../../../../contracts/studio";
export function SessionHistory({
  sessions,
  onDelete,
  onSelect,
}: {
  sessions: Session[];
  onDelete: (rows: Session[]) => Promise<void>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title="테스트 기록" />
      <DataTable
        onDeleteRows={onDelete}
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
            id: "data",
            header: "테스트데이터",
            sortValue: (s) => s.execution?.testDataName || "",
            cell: (s) => s.execution?.testDataName || "원본 값",
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
            sortValue: runStatus,
            cell: (s) => {
              const status = runStatus(s);
              return (
                <Badge
                  variant={
                    status === "실패"
                      ? "destructive"
                      : status === "통과"
                        ? "success"
                        : "default"
                  }
                >
                  {status}
                </Badge>
              );
            },
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
