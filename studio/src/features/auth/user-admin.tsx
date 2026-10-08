import { RefreshControl } from "@/components/refresh-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { API } from "@/lib/api";
import type { User } from "../../../../contracts/studio";
export function UserAdmin({ active = true }: { active?: boolean }) {
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
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
  async function save() {
    if (!editing || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(API + "/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: editing.name,
          role: editing.role,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "저장하지 못했어요.");
      setEditing(null);
      setRevision((v) => v + 1);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "저장하지 못했어요.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="사용자 관리"
        actions={
          <RefreshControl
            busy={loading}
            active={active}
            onRefresh={() => setRevision((value) => value + 1)}
          />
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
          rowActions={(user) => [
            {
              label: "수정",
              onSelect: () => {
                setSaveError("");
                setEditing({ ...user });
              },
            },
          ]}
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
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용자 수정</DialogTitle>
            <DialogDescription>
              사용자의 이름과 권한을 변경해요.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="user-id">아이디</Label>
                <Input id="user-id" value={editing.username} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-name">이름</Label>
                <Input
                  id="user-name"
                  value={editing.name}
                  required
                  maxLength={80}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-role">권한</Label>
                <Select
                  value={editing.role}
                  onValueChange={(role) =>
                    setEditing({ ...editing, role: role as User["role"] })
                  }
                >
                  <SelectTrigger id="user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">일반 사용자</SelectItem>
                    <SelectItem value="admin">관리자</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {saveError && (
                <p role="alert" className="text-sm text-destructive">
                  {saveError}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  저장
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
