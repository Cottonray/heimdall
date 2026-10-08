import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { API } from "@/lib/api";
import type { User } from "../../../../contracts/studio";
export function UserAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`${API}/admin/users`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("사용자 목록을 불러오지 못했어요.");
        const data = (await response.json()) as User[];
        if (!controller.signal.aborted) {
          setUsers(data);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("사용자 목록을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="사용자 관리"
        actions={
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            새로고침
          </Button>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">사용자 목록을 불러오고 있어요.</p>
      ) : (
        <DataTable
          data={users}
          caption="사용자 목록"
          getRowId={(user) => user.id}
          getRowLabel={(user) => user.name}
          searchText={(user) => `${user.username} ${user.name}`}
          searchPlaceholder="아이디 또는 이름 검색"
          columns={[
            {
              id: "username",
              header: "아이디",
              cell: (user) => user.username,
              sortValue: (user) => user.username,
            },
            {
              id: "name",
              header: "이름",
              cell: (user) => user.name,
              sortValue: (user) => user.name,
            },
            {
              id: "role",
              header: "권한",
              cell: (user) =>
                user.role === "admin" ? "관리자" : "일반 사용자",
              sortValue: (user) => user.role,
            },
          ]}
        />
      )}
    </div>
  );
}
