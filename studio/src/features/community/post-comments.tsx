import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API } from "@/lib/api";
import type { User } from "../../../../contracts/studio";

type Comment = {
  id: string;
  authorId: string;
  author: string;
  content: string;
  created: number;
  updated: number;
};
export function PostComments({ postId, user }: { postId: string; user: User }) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Comment | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(
      `${API}/community/comments?postId=${encodeURIComponent(postId)}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Comment[]>;
      })
      .then((data) => {
        setRows(data);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("댓글을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [postId, revision]);
  async function save(id?: string, remove = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/community/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          id,
          remove,
          content: id ? editing?.content : draft,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "댓글을 저장하지 못했어요.");
      if (!id) setDraft("");
      if (editing?.id === id) setEditing(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "댓글을 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 border-t pt-6" aria-label="댓글">
      <h2 className="text-lg font-semibold">댓글 {rows.length}</h2>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          댓글을 불러오고 있어요.
        </p>
      )}
      {!loading && !rows.length && !error && (
        <p className="text-sm text-muted-foreground">아직 댓글이 없어요.</p>
      )}
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-medium">{row.author}</span>
                <span className="ml-2 text-muted-foreground">
                  {new Date(Number(row.created)).toLocaleString("ko-KR")}
                  {Number(row.updated) > Number(row.created) ? " · 수정됨" : ""}
                </span>
              </p>
              {(row.authorId === user.id || user.role === "admin") && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setEditing({ ...row })}
                  >
                    수정
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("댓글을 삭제할까요?"))
                        void save(row.id, true);
                    }}
                  >
                    삭제
                  </Button>
                </div>
              )}
            </div>
            {editing?.id === row.id ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(row.id);
                }}
              >
                <Textarea
                  aria-label="댓글 수정"
                  maxLength={5000}
                  required
                  disabled={busy}
                  value={editing.content}
                  onChange={(e) =>
                    setEditing({ ...editing, content: e.target.value })
                  }
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    취소
                  </Button>
                  <Button disabled={busy || !editing.content.trim()}>
                    저장
                  </Button>
                </div>
              </form>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {row.content}
              </p>
            )}
          </li>
        ))}
      </ul>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Textarea
          aria-label="댓글 내용"
          placeholder="댓글을 입력해 주세요."
          rows={3}
          maxLength={5000}
          required
          disabled={busy}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex justify-end">
          <Button disabled={busy || !draft.trim()}>등록</Button>
        </div>
      </form>
    </section>
  );
}
