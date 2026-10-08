import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { API } from "@/lib/api";
type Entry = { id: string; name: string; content: string; updated: number };
export function ProjectTestData({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Partial<Entry> | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${API}/test-data?${new URLSearchParams({ projectId })}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Entry[]>;
      })
      .then((data) => {
        setEntries(data);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("테스트데이터를 불러오지 못했어요.");
      });
    return () => controller.abort();
  }, [projectId, revision]);
  async function save(data: Partial<Entry> & { remove?: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      if (!data.remove) JSON.parse(data.content || "");
      const response = await fetch(`${API}/test-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, projectId }),
      });
      if (!response.ok) throw new Error();
      setEditing(null);
      setRemoving(null);
      setError("");
      setRevision((v) => v + 1);
    } catch {
      setError(
        "저장하지 못했어요. 이름과 JSON 형식, 서버 연결을 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">테스트데이터</h1>
        <Button onClick={() => setEditing({ name: "", content: "{}" })}>
          데이터 추가
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DataTable
        data={entries}
        caption="프로젝트 테스트데이터"
        getRowId={(e) => e.id}
        getRowLabel={(e) => e.name}
        searchText={(e) => e.name}
        columns={[
          {
            id: "name",
            header: "이름",
            sortValue: (e) => e.name,
            cell: (e) => (
              <Button variant="link" onClick={() => setEditing(e)}>
                {e.name}
              </Button>
            ),
          },
          {
            id: "updated",
            header: "수정일",
            sortValue: (e) => Number(e.updated),
            cell: (e) => new Date(Number(e.updated)).toLocaleString("ko-KR"),
          },
        ]}
        rowActions={(e) => [
          { label: "수정", onSelect: () => setEditing(e) },
          { label: "삭제", onSelect: () => setRemoving(e) },
        ]}
      />
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>테스트데이터</DialogTitle>
            <DialogDescription>
              프로젝트에서 사용할 JSON 데이터를 저장해요.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) void save(editing);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="test-data-name">이름</Label>
              <Input
                id="test-data-name"
                required
                maxLength={80}
                value={editing?.name || ""}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-data-content">JSON</Label>
              <Textarea
                id="test-data-content"
                rows={10}
                required
                maxLength={50000}
                value={editing?.content || ""}
                onChange={(e) =>
                  setEditing({ ...editing, content: e.target.value })
                }
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button disabled={busy} type="submit">
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>테스트데이터 삭제</DialogTitle>
            <DialogDescription>
              {removing?.name} 데이터를 삭제해요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                removing && void save({ ...removing, remove: true })
              }
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
