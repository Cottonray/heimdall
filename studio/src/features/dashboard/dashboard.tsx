import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Plus, Check, Minus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { engines } from "@/lib/labels";
import { buildMetrics, isAssertion } from "./metrics";
import type { Session } from "../../../../contracts/studio";

const resultConfig = {
  passed: { label: "통과", color: "var(--primary)" },
  failed: { label: "실패", color: "var(--destructive)" },
} satisfies ChartConfig;
const coverageConfig = {
  covered: { label: "검증 실행", color: "var(--primary)" },
  remaining: { label: "미검증", color: "var(--muted)" },
} satisfies ChartConfig;

export function Dashboard({
  sessions,
  onNew,
  onSelect,
  overview = false,
  loading = false,
  active = true,
}: {
  sessions: Session[];
  onNew?: () => void;
  onSelect?: (id: string) => void;
  overview?: boolean;
  loading?: boolean;
  active?: boolean;
}) {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const metrics = buildMetrics(sessions);
  const coverageData = [
    { name: "covered", value: metrics.covered, fill: "var(--primary)" },
    {
      name: "remaining",
      value: 4 - metrics.covered,
      fill: "var(--muted)",
    },
  ];
  const stats = [
    {
      label: "전체 테스트",
      value: String(metrics.total),
      detail: `총 ${metrics.actions}개 동작`,
    },
    {
      label: "검증 성공률",
      value: metrics.successRate === null ? "—" : `${metrics.successRate}%`,
      detail: `${metrics.assertions}회 중 ${metrics.passed}회 통과`,
    },
    {
      label: "유형 커버리지",
      value: `${metrics.coverage}%`,
      detail: `4개 유형 중 ${metrics.covered}개 검증 실행`,
    },
    {
      label: "실패 동작",
      value: String(metrics.failedActions),
      detail: `검증 실패 ${metrics.failed}회 포함`,
    },
  ];
  if (loading)
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label="테스트 현황을 불러오는 중"
        aria-busy="true"
      >
        <Skeleton className="h-8 w-36" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent variant="stack">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          {[0, 1].map((index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        {onSelect && (
          <section className="space-y-3">
            <Skeleton className="h-5 w-24" />
            <div className="space-y-2 border-y py-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </section>
        )}
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {overview ? (
            <h2 className="text-2xl font-semibold tracking-tight">
              테스트 현황
            </h2>
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">
              테스트 현황
            </h1>
          )}
        </div>
        {onNew && (
          <Button onClick={onNew}>
            <Plus />새 테스트
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {stat.value}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {stat.detail}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>테스트 유형 커버리지</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid items-center gap-6 sm:grid-cols-2">
              <div className="relative">
                <ChartContainer
                  config={coverageConfig}
                  className="h-56 w-full"
                  aria-label={`전체 4개 유형 중 ${metrics.covered}개 유형에서 검증 실행, ${metrics.coverage}%`}
                >
                  <PieChart key={String(active)} accessibilityLayer>
                    <Pie
                      data={coverageData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="72%"
                      outerRadius="95%"
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                      isAnimationActive={active && !reducedMotion}
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent nameKey="name" hideLabel />}
                    />
                  </PieChart>
                </ChartContainer>
                <div
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                  aria-hidden="true"
                >
                  <span className="text-3xl font-semibold tabular-nums">
                    {metrics.coverage}%
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {metrics.covered} / 4 유형
                  </span>
                </div>
              </div>
              <ul className="space-y-4">
                {metrics.types.map((type) => (
                  <li
                    key={type.engine}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>{engines[type.engine].label}</span>
                    <Badge variant={type.assertions ? "success" : "secondary"}>
                      {type.assertions ? <Check /> : <Minus />}
                      {type.assertions ? `${type.assertions}회` : "미검증"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>최근 7일 검증 결과</CardTitle>
            <CardDescription>
              결과 검증과 API 검증의 통과·실패 횟수
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={resultConfig}
              className="h-56 w-full"
              aria-label="최근 7일 일별 검증 통과 및 실패 횟수"
            >
              <BarChart
                key={String(active)}
                accessibilityLayer
                data={metrics.daily}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="passed"
                  stackId="checks"
                  fill="var(--primary)"
                  radius={3}
                  isAnimationActive={active && !reducedMotion}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="failed"
                  stackId="checks"
                  fill="var(--destructive)"
                  radius={3}
                  isAnimationActive={active && !reducedMotion}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ChartContainer>
            <div className="mt-4 flex justify-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary" />
                통과
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-destructive" />
                실패
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
      {onSelect && (
        <section className="space-y-3" aria-labelledby="recent-tests-title">
          <h2 id="recent-tests-title" className="text-base font-semibold">
            최근 테스트
          </h2>
          <Table>
            <TableHeader>
              <TableRow variant="static">
                <TableHead>테스트 이름</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>동작 수</TableHead>
                <TableHead>검증 결과</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.recent.map((session) => {
                const assertions = session.steps.filter(isAssertion);
                const passed = assertions.filter((step) => step.ok).length;
                return (
                  <TableRow key={session.id} variant="static">
                    <TableCell className="whitespace-normal break-words">
                      {session.name}
                    </TableCell>
                    <TableCell>{engines[session.engine].label}</TableCell>
                    <TableCell>{session.steps.length}개</TableCell>
                    <TableCell>
                      {assertions.length
                        ? `${passed} / ${assertions.length} 통과`
                        : "미검증"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!metrics.recent.length && (
                <TableRow variant="static">
                  <TableCell colSpan={4} variant="empty">
                    첫 테스트를 실행하면 여기에 기록이 쌓여요.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
