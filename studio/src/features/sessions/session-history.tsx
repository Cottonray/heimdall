import { useState } from "react";
import { Search, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { engines } from "@/lib/labels";
import type { Session } from "../../../../contracts/studio";
export function SessionHistory({
  sessions,
  onSelect,
}: {
  sessions: Session[];
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = sessions.filter((s) =>
    (s.name + " " + engines[s.engine].label)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">테스트 기록</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length}개 테스트
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="테스트 검색"
            placeholder="이름 또는 유형 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <Card>
        <CardContent>
          <ul className="divide-y">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex w-full items-center justify-between gap-4 rounded-lg py-4 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {s.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {engines[s.engine].label} · {s.steps.length}개 동작 ·{" "}
                      {new Date(s.updated).toLocaleString("ko-KR")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <StatusBadge state={s.state} />
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search ? "검색 결과가 없어요." : "아직 테스트 기록이 없어요."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
