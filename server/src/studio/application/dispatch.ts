import type { ToolArguments } from "../domain/types.ts";
import { get, publicSession, sessions } from "../domain/session.ts";
import { listSessions, saved } from "../infrastructure/repository.ts";
import { observe } from "../engines/observe.ts";
import { script } from "../domain/export.ts";
import { open, pause, close, ensureActive } from "./sessions.ts";
import { agent } from "./agent.ts";
import { action } from "./actions.ts";
import { replay } from "./replay.ts";
export async function dispatch(name: string, a: ToolArguments) {
  if (name === "qa_list") return listSessions();
  if (name === "qa_open") return open(a);
  if (name === "qa_export") {
    const s = await saved(a.id || "");
    return {
      session: s,
      code: script(s),
      jsonl: s.steps.map((x) => JSON.stringify(x)).join("\n"),
    };
  }
  if (name === "qa_run") {
    const source = await saved(a.id || "");
    if (!a.projectId || (source.projectId || "default") !== a.projectId)
      throw new Error("현재 프로젝트의 시나리오를 선택해 주세요.");
    return replay(source, a);
  }
  if (name === "qa_replay") return replay(await saved(a.id || ""));
  // Passive UI refresh must never reopen a closed device session.
  if (name === "qa_observe" && a.passiveObservation) {
    const current = sessions.get(a.id || "");
    return current ? publicSession(current) : saved(a.id || "");
  }
  const s = ["qa_observe", "qa_action", "qa_agent"].includes(name)
    ? await ensureActive(a.id || "", true)
    : get(a.id || "");
  if (name === "qa_observe") {
    await observe(s);
    return publicSession(s);
  }
  if (name === "qa_pause") return pause(s);
  if (name === "qa_close") return close(s);
  if (name === "qa_agent")
    return agent(s, String(a.goal || "화면을 확인해 주세요"));
  if (name === "qa_action") {
    if (s.state === "ai" || s.state === "replay")
      throw new Error("사람 개입을 눌러 자동 실행을 멈춰 주세요");
    if (!a.action) throw new Error("동작을 지정해 주세요");
    return action(s, a.action, "Human");
  }
  throw new Error("없는 도구예요");
}
