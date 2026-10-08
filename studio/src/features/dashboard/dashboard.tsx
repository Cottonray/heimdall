import { Item } from "@/components/ui/item";
import { Plus, ArrowUpRight, Check, Minus } from "lucide-react";
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
}: {
  sessions: Session[];
  onNew?: () => void;
  onSelect?: (id: string) => void;
  overview?: boolean;
}) {
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
          <p className="mt-1 text-sm text-muted-foreground">
            {overview && "전체 프로젝트 · "}최근 {metrics.total}개 테스트 기준
          </p>
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
            <CardDescription>결과 검증을 실행한 유형의 비율</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid items-center gap-6 sm:grid-cols-2">
              <div className="relative">
                <ChartContainer
                  config={coverageConfig}
                  className="h-56 w-full"
                  aria-label={`전체 4개 유형 중 ${metrics.covered}개 유형에서 검증 실행, ${metrics.coverage}%`}
                >
                  <PieChart accessibilityLayer>
                    <Pie
                      data={coverageData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="72%"
                      outerRadius="95%"
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                      isAnimationActive={false}
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
              <BarChart accessibilityLayer data={metrics.daily}>
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
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="failed"
                  stackId="checks"
                  fill="var(--destructive)"
                  radius={3}
                  isAnimationActive={false}
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
        <Card>
          <CardHeader>
            <CardTitle>최근 테스트</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.recent.length ? (
              <ul className="divide-y">
                {metrics.recent.map((session) => {
                  const assertions = session.steps.filter(isAssertion);
                  const passed = assertions.filter((step) => step.ok).length;
                  return (
                    <li key={session.id}>
                      <Item variant="row" size="row" asChild>
                        <button
                          type="button"
                          onClick={() => onSelect(session.id)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {session.name}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {engines[session.engine].label} ·{" "}
                              {session.steps.length}개 동작
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            <span className="text-xs text-muted-foreground">
                              {assertions.length
                                ? `${passed} / ${assertions.length} 통과`
                                : "미검증"}
                            </span>
                            <ArrowUpRight className="size-4 text-muted-foreground" />
                          </span>
                        </button>
                      </Item>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                첫 테스트를 실행하면 여기에 기록이 쌓입니다.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
