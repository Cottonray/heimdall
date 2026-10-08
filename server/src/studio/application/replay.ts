import type { PublicSession } from "../domain/types.ts";
import { get, publicSession } from "../domain/session.ts";
import { persist } from "../infrastructure/repository.ts";
import { open } from "./sessions.ts";
import { action } from "./actions.ts";
export async function replay(source: PublicSession) {
  const s = get(
    (
      await open({
        engine: source.engine,
        url: source.url,
        name: `${source.name} · 재실행`,
        parent: source.id,
        projectId: source.projectId,
      })
    ).id,
  );
  s.state = "replay";
  s.ai = true;
  const epoch = ++s.epoch;
  await persist(s);
  void (async () => {
    try {
      for (const step of source.steps) {
        if (s.epoch !== epoch) break;
        if (!(await action(s, step.action, "Replay")).ok) break;
      }
      if (s.epoch === epoch && s.state === "replay") {
        s.state = s.steps.some(
          (x) => x.ok && ["assert", "api"].includes(x.action.type),
        )
          ? "passed"
          : "paused";
        s.message =
          s.state === "passed"
            ? "저장한 시나리오를 검증했어요"
            : "조작 재현 완료 · 검증 조건을 추가해 주세요";
      }
    } catch (e) {
      if (s.epoch === epoch) {
        s.state = "paused";
        s.message = String(e);
      }
    } finally {
      s.ai = false;
      await persist(s).catch(console.error);
    }
  })();
  return publicSession(s);
}
