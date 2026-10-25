import * as appium from "../../appium.ts";
import * as device from "../../device.ts";
import { prepareTestTarget } from "../infrastructure/domains.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Session, Step, Action } from "../domain/types.ts";
import { validateAction } from "../domain/validation.ts";
import { android } from "../engines/android.ts";
import { worker } from "../engines/browser.ts";
import { observe, frame } from "../engines/observe.ts";
import { DIR } from "../infrastructure/config.ts";
import { persist } from "../infrastructure/repository.ts";
export async function action(s: Session, input: Action, actor: string) {
  if (s.working) throw new Error("현재 동작이 끝나면 조작할 수 있어요");
  if (s.steps.length >= 80) throw new Error("한 세션에 80단계까지 기록해요");
  if (["AI", "Codex"].includes(actor) && (typeof input.comment !== "string" || !input.comment.trim()))
    throw new Error("AI 동작에는 목적을 설명하는 한국어 comment가 반드시 필요해요.");
  const a = validateAction(input);
  s.working = true;
  const work = (async () => {
    const t = Date.now(),
      step: Step = {
        n: s.steps.length + 1,
        at: new Date().toISOString(),
        actor,
        action: a,
        ok: false,
        ms: 0,
      };
    // Capture before the action: navigation and keyboards can move the target.
    if (["click", "fill", "type", "point"].includes(a.type)) {
      try {
        let target;
        if (s.engine === "android") {
          const size = await device.screenSize();
          const el = a.type === "type" || a.type === "point" ? undefined :
            a.selector ? await appium.findId(s.appiumId!, a.selector) : await appium.findText(s.appiumId!, String(a.text || ""));
          const rect = a.type === "point" ? { x: Number(a.x) - 12, y: Number(a.y) - 12, width: 24, height: 24 } :
            (el || a.type === "type") ? await appium.targetRect(s.appiumId!, el || undefined) : null;
          if (rect) target = { ...rect, screenWidth: size.width, screenHeight: size.height };
        } else {
          target = await worker<Step["target"]>("/target", { id: s.id, action: a });
        }
        if (target && Object.values(target).every(Number.isFinite) && target.width > 0 && target.height > 0) {
          await mkdir(path.join(DIR, s.id), { recursive: true });
          const file = `${1000 + step.n}.jpg`;
          await writeFile(path.join(DIR, s.id, file), await frame(s));
          step.target = target;
          step.targetEvidence = file;
        }
      } catch { /* Missing bounds must not block the actual action. */ }
    }
    try {
      if (s.engine !== "android" && ["goto", "api"].includes(a.type) && a.url)
        await prepareTestTarget(a.url);
      if (s.engine === "android") await android(s, a);
      else {
        const result = await worker<{ action: Action }>("/action", {
          id: s.id,
          action: a,
        });
        step.action = result.action;
        if (a.type === "api") step.observation = result;
      }
      step.ok = true;
    } catch (e) {
      step.error = String(e).slice(0, 600);
      s.state = "paused";
      s.message = step.error;
    }
    try {
      s.observation = await observe(s);
      step.observation ??= s.observation;
      await mkdir(path.join(DIR, s.id), { recursive: true });
      await writeFile(path.join(DIR, s.id, `${step.n}.jpg`), await frame(s));
      step.evidence = `${step.n}.jpg`;
    } catch (e) {
      step.error = [step.error, `증적: ${String(e)}`]
        .filter(Boolean)
        .join(" · ");
    }
    step.ms = Date.now() - t;
    s.steps.push(step);
    s.working = false;
    if (actor === "Human" && step.ok && ["assert", "api"].includes(a.type)) {
      s.state = "passed";
      s.message = "기대 결과를 확인했어요";
    }
    await persist(s);
    return step;
  })();
  s.tail = work;
  try {
    return await work;
  } finally {
    s.working = false;
  }
}
