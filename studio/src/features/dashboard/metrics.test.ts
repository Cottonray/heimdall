import test from "node:test";
import assert from "node:assert/strict";
import { buildMetrics } from "./metrics.ts";
import type { Engine, Session, Step } from "../../../../contracts/studio.ts";

const now = new Date("2026-10-08T15:30:00Z");
function step(type: string, ok = true, at = "2026-10-08T15:00:00Z"): Step {
  return { n: 1, at, actor: "ai", action: { type }, ok, ms: 5 };
}
function session(engine: Engine, steps: Step[], id: string = engine): Session {
  return {
    id,
    engine,
    steps,
    name: id,
    url: "",
    state: "closed",
    message: "",
    created: now.toISOString(),
    updated: now.getTime(),
    working: false,
    ai: false,
  };
}

test("empty history has no fabricated success rate or coverage", () => {
  const metrics = buildMetrics([], now);
  assert.equal(metrics.coverage, 0);
  assert.equal(metrics.successRate, null);
  assert.equal(metrics.assertions, 0);
  assert.equal(metrics.daily.length, 7);
  assert.ok(metrics.daily.every((day) => day.passed === 0 && day.failed === 0));
});

test("coverage requires assertion execution, not opening or clicking", () => {
  const metrics = buildMetrics(
    [
      session("web", [step("click"), step("assert")]),
      session("mobile-web", []),
      session("android", [step("click")]),
      session("api", [step("api", false)]),
    ],
    now,
  );
  assert.equal(metrics.total, 4);
  assert.equal(metrics.covered, 2);
  assert.equal(metrics.coverage, 50);
  assert.equal(metrics.successRate, 50);
  assert.equal(metrics.actions, 4);
});

test("closed sessions retain passed and failed checks; action failures stay distinct", () => {
  const metrics = buildMetrics(
    [
      session("web", [
        step("click", false),
        step("assert"),
        step("assert", false),
      ]),
    ],
    now,
  );
  assert.equal(metrics.assertions, 2);
  assert.equal(metrics.passed, 1);
  assert.equal(metrics.failed, 1);
  assert.equal(metrics.failedActions, 2);
});

test("daily chart uses Korean calendar dates and excludes old, invalid and future timestamps", () => {
  const metrics = buildMetrics(
    [
      session("api", [
        step("api", true, "2026-10-08T14:59:59Z"),
        step("api", false, "2026-10-08T15:00:00Z"),
        step("api", true, "2026-09-30T00:00:00Z"),
        step("api", true, "invalid"),
        step("api", true, "2026-10-09T00:00:00Z"),
      ]),
    ],
    now,
  );
  assert.equal(metrics.daily[6].date, "2026-10-09");
  assert.equal(metrics.daily[5].passed, 1);
  assert.equal(metrics.daily[6].failed, 1);
  assert.equal(
    metrics.daily.reduce((sum, day) => sum + day.passed + day.failed, 0),
    2,
  );
});

test("recent list is sorted without mutating input", () => {
  const older = { ...session("web", [], "older"), updated: 1 };
  const newer = { ...session("api", [], "newer"), updated: 2 };
  const input = [older, newer];
  assert.equal(buildMetrics(input, now).recent[0].id, "newer");
  assert.equal(input[0].id, "older");
});
