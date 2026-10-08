import { RefreshControl } from "@/components/refresh-control";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { API } from "@/lib/api";
import type { User } from "../../../../contracts/studio";
type Post = {
  id: string;
  authorId: string;
  author: string;
  title: string;
  content: string;
  created: number;
  updated: number;
};
export function Community({
  user,
  active = true,
}: {
  user: User;
  active?: boolean;
}) {
  const [rows, setRows] = useState<Post[]>([]),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [reading, setReading] = useState<Post | null>(null),
    [editing, setEditing] = useState<Partial<Post> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(API + "/community", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Post[]>;
      })
      .then((data) => {
        setRows(data);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("게시글을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(API + "/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          title: editing.title,
          content: editing.content,
        }),
      });
      const b = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(b.error || "저장하지 못했어요.");
      setEditing(null);
      setReading(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="커뮤니티"
        description="질문과 테스트 경험을 함께 나눠요."
        actions={
          <>
            <RefreshControl
              busy={loading}
              active={active}
              onRefresh={() => setRevision((value) => value + 1)}
            />
            <Button
              onClick={() => {
                setError("");
                setEditing({ title: "", content: "" });
              }}
            >
              작성
            </Button>
          </>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">게시글을 불러오고 있어요.</p>
      ) : (
        <DataTable
          data={rows}
          caption="커뮤니티 게시글"
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.title}
          searchText={(r) => `${r.title} ${r.content} ${r.author}`}
          searchPlaceholder="제목 · 내용 · 작성자 검색"
          emptyMessage="아직 게시글이 없어요. 첫 글을 작성해 주세요."
          rowActions={(r) => [
            { label: "상세", onSelect: () => setReading(r) },
            ...(r.authorId === user.id || user.role === "admin"
              ? [
                  {
                    label: "수정",
                    onSelect: () => {
                      setError("");
                      setEditing({ ...r });
                    },
                  },
                ]
              : []),
          ]}
          columns={[
            {
              id: "title",
              header: "제목",
              sortValue: (r) => r.title,
              cell: (r) => (
                <Button variant="link" onClick={() => setReading(r)}>
                  {r.title}
                </Button>
              ),
            },
            { id: "author", header: "작성자", cell: (r) => r.author },
            {
              id: "created",
              header: "작성일",
              sortValue: (r) => Number(r.created),
              cell: (r) => new Date(Number(r.created)).toLocaleString("ko-KR"),
            },
          ]}
        />
      )}
      <Dialog
        open={!!reading && !editing}
        onOpenChange={(open) => {
          if (!open) setReading(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            <DialogDescription>
              {reading?.author} ·{" "}
              {reading &&
                new Date(Number(reading.created)).toLocaleString("ko-KR")}
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm">
            {reading?.content}
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "게시글 수정" : "게시글 작성"}
            </DialogTitle>
            <DialogDescription>
              로그인한 사용자들과 공유할 내용을 적어 주세요.
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
                <Label htmlFor="post-title">제목</Label>
                <Input
                  id="post-title"
                  value={editing.title || ""}
                  required
                  maxLength={150}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="post-content">내용</Label>
                <Textarea
                  id="post-content"
                  rows={10}
                  value={editing.content || ""}
                  required
                  maxLength={20000}
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
                <Button type="submit" disabled={busy}>
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
