import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useState } from "react";
import { Plus } from "lucide-react";
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
  const [notice, setNotice] = useState("");
  const columns: DataTableColumn<Domain>[] = [
    {
      id: "name",
      header: "도메인 이름",
      sortValue: (domain) => domain.name,
      cell: (domain) => <span className="font-medium">{domain.name}</span>,
    },
    {
      id: "environment",
      header: "환경",
      cell: (domain) =>
        ({ web: "웹", app: "앱", api: "API" })[domain.environment || "web"],
      sortValue: (domain) => domain.environment || "web",
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
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="도메인"
        actions={
          admin && (
            <Button onClick={() => setEditing({ name: "", url: "" })}>
              <Plus />
              도메인 추가
            </Button>
          )
        }
      />
      <DataTable
        onDeleteRows={
          admin
            ? async (rows) => {
                for (const row of rows)
                  if (!(await onRemove(row.id)))
                    throw new Error(
                      "일부 도메인을 삭제하지 못했어요. 목록을 확인해 주세요.",
                    );
              }
            : undefined
        }
        rowActions={(domain) => [
          {
            label: "주소 복사",
            onSelect: () => {
              void navigator.clipboard.writeText(domain.url).then(
                () => setNotice("주소를 복사했어요."),
                () => setNotice("주소를 복사하지 못했어요."),
              );
            },
          },
          ...[
            {
              label: "수정",
              disabled: busy || !admin,
              onSelect: () => setEditing(domain),
            },
            {
              label: "삭제",
              disabled: busy || !admin,
              onSelect: () => setRemoving(domain),
            },
          ],
        ]}
        data={domains}
        columns={columns}
        getRowId={(domain) => domain.id}
        getRowLabel={(domain) => domain.name}
        searchText={(domain) => domain.name + " " + domain.url}
        searchPlaceholder="도메인 이름 또는 주소 검색"
        caption="등록된 테스트 도메인"
        emptyMessage="등록된 도메인이 없어요."
      />
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
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
              <Label htmlFor="domain-environment">환경</Label>
              <Select
                value={editing?.environment || "web"}
                onValueChange={(environment) =>
                  setEditing({
                    ...editing,
                    environment: environment as Domain["environment"],
                  })
                }
              >
                <SelectTrigger id="domain-environment" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">웹</SelectItem>
                  <SelectItem value="app">앱</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
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
