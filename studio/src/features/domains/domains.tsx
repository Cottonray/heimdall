import { useState } from "react";
import { Globe, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
      <Card>
        <CardContent>
          <ul className="divide-y">
            {domains.map((domain) => (
              <li
                key={domain.id}
                className="flex flex-wrap items-center gap-4 py-4"
              >
                <Globe className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{domain.name}</p>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {domain.url}
                  </p>
                </div>
                {admin && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={domain.name + " 수정"}
                      onClick={() => setEditing(domain)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={domain.name + " 삭제"}
                      onClick={() => setRemoving(domain)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!domains.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              등록된 도메인이 없어요.
            </p>
          )}
        </CardContent>
      </Card>
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
                placeholder="https://example.com"
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
