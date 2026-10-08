import type { Engine, Session, Step } from "../../../../contracts/studio.ts";

export const engineOrder: Engine[] = ["web", "mobile-web", "android", "api"];
export const isAssertion = (step: Step) =>
  step.action.type === "assert" || step.action.type === "api";

const dayFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function buildMetrics(sessions: Session[], now = new Date()) {
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = dayFormat.format(
      new Date(now.getTime() - (6 - index) * 86_400_000),
    );
    return {
      date,
      label: date.slice(5).replace("-", "/"),
      passed: 0,
      failed: 0,
    };
  });
  const types = engineOrder.map((engine) => ({
    engine,
    sessions: 0,
    passed: 0,
    failed: 0,
    assertions: 0,
  }));
  let actions = 0;
  let failedActions = 0;
  for (const session of sessions) {
    const type = types.find((item) => item.engine === session.engine);
    if (!type) continue;
    type.sessions += 1;
    for (const step of session.steps) {
      actions += 1;
      if (!step.ok) failedActions += 1;
      if (!isAssertion(step)) continue;
      type.assertions += 1;
      type[step.ok ? "passed" : "failed"] += 1;
      const at = new Date(step.at);
      if (!Number.isFinite(at.getTime()) || at > now) continue;
      const day = daily.find((item) => item.date === dayFormat.format(at));
      if (day) day[step.ok ? "passed" : "failed"] += 1;
    }
  }
  const passed = types.reduce((sum, item) => sum + item.passed, 0);
  const failed = types.reduce((sum, item) => sum + item.failed, 0);
  const assertions = passed + failed;
  const covered = types.filter((type) => type.assertions > 0).length;
  return {
    total: sessions.length,
    actions,
    failedActions,
    passed,
    failed,
    assertions,
    covered,
    coverage: Math.round((covered / engineOrder.length) * 100),
    successRate: assertions ? Math.round((passed / assertions) * 100) : null,
    types,
    daily,
    recent: [...sessions].sort((a, b) => b.updated - a.updated).slice(0, 5),
  };
}
