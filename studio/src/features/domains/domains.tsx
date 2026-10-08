import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Domain } from "../../../../contracts/studio";
export function Domains({
  domains,
  admin,
  busy,
  error,
  onSave,
  onRemove,
}: {
  domains: Domain[];
  admin: boolean;
  busy: boolean;
  error: string;
  onSave: (domain: Partial<Domain>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<Partial<Domain> | null>(null);
  const [removing, setRemoving] = useState<Domain | null>(null);
  const columns: DataTableColumn<Domain>[] = [
    {
      id: "name",
      header: "도메인 이름",
      sortValue: (domain) => domain.name,
      cell: (domain) => <span className="font-medium">{domain.name}</span>,
    },
    {
      id: "url",
      header: "주소",
      sortValue: (domain) => domain.url,
      cell: (domain) => (
        <span data-selectable className="break-all text-muted-foreground">
          {domain.url}
        </span>
      ),
    },
    ...(admin
      ? [
          {
            id: "actions",
            header: "관리",
            cell: (domain: Domain) => (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={domain.name + " 수정"}
                  onClick={() => setEditing(domain)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={domain.name + " 삭제"}
                  onClick={() => setRemoving(domain)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">도메인</h1>
        {admin && (
          <Button onClick={() => setEditing({ name: "", url: "" })}>
            <Plus />
            도메인 추가
          </Button>
        )}
      </div>
      <DataTable
        data={domains}
        columns={columns}
        getRowId={(domain) => domain.id}
        getRowLabel={(domain) => domain.name}
        searchText={(domain) => domain.name + " " + domain.url}
        searchPlaceholder="도메인 이름 또는 주소 검색"
        caption="등록된 테스트 도메인"
        emptyMessage="등록된 도메인이 없어요."
      />
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "도메인 수정" : "도메인 추가"}
            </DialogTitle>
            <DialogDescription>
              테스트를 허용할 주소를 등록해요.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (editing && (await onSave(editing))) setEditing(null);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="domain-name">이름</Label>
              <Input
                id="domain-name"
                required
                maxLength={80}
                value={editing?.name || ""}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain-url">주소</Label>
              <Input
                id="domain-url"
                type="url"
                required
                placeholder="https://web.example/"
                value={editing?.url || ""}
                onChange={(e) =>
                  setEditing({ ...editing, url: e.target.value })
                }
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(v) => {
          if (!v) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>도메인 삭제</DialogTitle>
            <DialogDescription>
              {removing?.name} 주소를 테스트 허용 목록에서 삭제해요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (removing && (await onRemove(removing.id)))
                  setRemoving(null);
              }}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
