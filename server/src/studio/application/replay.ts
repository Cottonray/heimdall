import type { PublicSession } from "../domain/types.ts";
import type { RunOptions, Execution } from "../../../../contracts/studio.ts";
import { get, publicSession } from "../domain/session.ts";
import { persist } from "../infrastructure/repository.ts";
import { readTestData } from "../infrastructure/test-data.ts";
import { bindActions } from "../domain/data-bindings.ts";
import { validateAction } from "../domain/validation.ts";
import { normalizeDomain } from "../infrastructure/domains.ts";
import { open } from "./sessions.ts";
import { action } from "./actions.ts";
export async function replay(source: PublicSession, options: RunOptions = {}) {
  if (source.plan) throw new Error("앱 연결과 화면 요소 확인이 필요한 시나리오 초안이에요.");
  if (!source.steps.length || source.steps.length > 80)
    throw new Error("실행할 동작이 1~80개인 시나리오를 선택해 주세요.");
  if (
    options.sourceUpdated !== undefined &&
    Number(options.sourceUpdated) !== source.updated
  )
    throw new Error("시나리오가 변경됐어요. 다시 선택해 주세요.");
  const data = options.testDataId
    ? await readTestData(source.projectId || "default", options.testDataId)
    : undefined;
  if (
    data &&
    options.testDataUpdated !== undefined &&
    Number(options.testDataUpdated) !== data.updated
  )
    throw new Error(
      "테스트데이터가 변경됐어요. 새로고침 후 다시 선택해 주세요.",
    );
  if (!data && options.bindings?.length)
    throw new Error("적용할 테스트데이터를 선택해 주세요.");
  const prepared = data
    ? bindActions(source, data, options.bindings || [])
    : {
        url: source.url,
        actions: source.steps.map((step) => structuredClone(step.action)),
      };
  const actions = prepared.actions.map(validateAction);
  if (source.engine !== "android") {
    normalizeDomain(prepared.url);
    for (const a of actions)
      if (["goto", "api"].includes(a.type) && a.url) normalizeDomain(a.url);
  }
  const s = get(
    (
      await open({
        engine: source.engine,
        appPackage: source.appPackage,
        url: prepared.url,
        name: `${source.name} · ${data?.name || "재실행"}`,
        parent: source.id,
        projectId: source.projectId,
      })
    ).id,
  );
  s.execution = {
    sourceId: source.id,
    sourceName: source.name,
    ...(data
      ? {
          testDataId: data.id,
          testDataName: data.name,
          testDataUpdated: data.updated,
        }
      : {}),
    bindings: options.bindings || [],
    actions: structuredClone(actions),
    total: actions.length,
    status: "running",
    started: Date.now(),
  };
  s.state = "replay";
  s.ai = true;
  const epoch = ++s.epoch;
  await persist(s);
  void (async () => {
    let outcome: Execution["status"] = "completed";
    try {
      for (const input of actions) {
        if (s.epoch !== epoch) {
          outcome = "interrupted";
          break;
        }
        const step = await action(s, input, "Replay");
        if (!step.ok || step.error) {
          outcome = "failed";
          break;
        }
      }
      if (s.epoch !== epoch) outcome = "interrupted";
      if (
        outcome === "completed" &&
        s.steps.some((step) => ["assert", "api"].includes(step.action.type))
      )
        outcome = "passed";
      if (s.epoch === epoch) {
        s.state = outcome === "passed" ? "passed" : "paused";
        if (outcome !== "failed")
          s.message =
            outcome === "passed"
              ? "모든 동작과 검증 조건을 통과했어요"
              : "동작 실행을 완료했어요. 검증 조건은 없어요";
      }
    } catch (error) {
      outcome = "failed";
      if (s.epoch === epoch) {
        s.state = "paused";
        s.message = String(error);
      }
    } finally {
      s.execution!.status = outcome;
      s.execution!.finished = Date.now();
      s.ai = false;
      await persist(s).catch(console.error);
    }
  })();
  return publicSession(s);
}
