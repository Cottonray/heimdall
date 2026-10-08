import { randomUUID } from "node:crypto";
import type { Session, NewSession, Observation } from "../domain/types.ts";
import { sessions, publicSession } from "../domain/session.ts";
import * as device from "../../device.ts";
import * as appium from "../../appium.ts";
import * as control from "../../control.ts";
import * as runner from "../../runner.ts";
import { ensureDb, persist } from "../infrastructure/repository.ts";
import { worker } from "../engines/browser.ts";
import { observe } from "../engines/observe.ts";
let mobileReserved = false;
function hasContent(observation?: Observation) {
  return (
    Array.isArray(observation?.tree) &&
    observation.tree.some((n) => n.text || n.desc)
  );
}
export async function open(data: NewSession) {
  await ensureDb();
  const engine = ["web", "mobile-web", "api", "android"].includes(
    data.engine || "",
  )
    ? data.engine!
    : "web";
  if (
    engine === "android" &&
    (mobileReserved || runner.busy() || control.snapshot().kind !== "none")
  )
    throw new Error("기기를 다른 실행이 사용하고 있어요");
  if (
    engine !== "android" &&
    [...sessions.values()].filter(
      (s) => s.engine !== "android" && s.state !== "closed",
    ).length >= 2
  )
    throw new Error(
      "브라우저 슬롯 두 개가 사용 중이에요. 세션을 종료해 주세요",
    );
  if (engine === "android") {
    mobileReserved = true;
    control.lockForRunner("QA Studio");
  }
  const s: Session = {
    id: randomUUID(),
    name: String(data.name || "새 테스트").slice(0, 80),
    engine,
    url: String(data.url || "http://127.0.0.1:8081/demo/"),
    state: "opening",
    message: "테스트 환경을 준비해요",
    created: new Date().toISOString(),
    updated: Date.now(),
    steps: [],
    epoch: 0,
    working: false,
    ai: false,
    tail: Promise.resolve(),
    parent: data.parent,
  };
  sessions.set(s.id, s);
  try {
    if (engine === "android") {
      if (!(await device.state()).booted)
        throw new Error("Android 기기가 준비되지 않았어요");
      s.appiumId = await appium.open(1200);
      await appium.launch(s.appiumId, device.APP_ID, false);
      device.invalidateDump();
    } else
      await worker("/open", {
        id: s.id,
        url: s.url,
        mobile: engine === "mobile-web",
      });
    await observe(s);
    if (engine === "android") {
      for (let i = 0; i < 12 && !hasContent(s.observation); i++) {
        await new Promise((r) => setTimeout(r, 300));
        await observe(s);
      }
      if (!hasContent(s.observation))
        throw new Error(
          "앱의 화면 요소가 아직 준비되지 않았어요. 다시 열어 주세요",
        );
    }
    s.state = "manual";
    s.message = "직접 조작하거나 AI에게 목표를 알려 주세요";
    await persist(s);
    return publicSession(s);
  } catch (e) {
    sessions.delete(s.id);
    if (s.appiumId) await appium.close(s.appiumId);
    if (engine === "android") {
      mobileReserved = false;
      control.unlockRunner();
    } else await worker("/close", { id: s.id }).catch(() => {});
    throw e;
  }
}
export async function pause(s: Session) {
  s.epoch++;
  s.state = "paused";
  s.message = "진행 중인 한 동작이 끝나면 직접 조작할 수 있어요";
  await s.tail.catch(() => {});
  await persist(s);
  return publicSession(s);
}
export async function close(s: Session) {
  await pause(s);
  if (s.appiumId) {
    await appium.close(s.appiumId);
    mobileReserved = false;
    control.unlockRunner();
  } else await worker("/close", { id: s.id });
  s.state = "closed";
  s.message = "세션을 종료했어요. 기록은 보관돼요";
  await persist(s);
  return publicSession(s);
}
