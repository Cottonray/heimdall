import { prepareDeviceTakeover } from "./device-takeover.ts";
import { watching } from "./test-presence.ts";
import { prepareTestTarget } from "../infrastructure/domains.ts";
import { randomUUID } from "node:crypto";
import type {
  Session,
  NewSession,
  Observation,
  PublicSession,
} from "../domain/types.ts";
import { sessions, publicSession } from "../domain/session.ts";
import * as device from "../../device.ts";
import * as appium from "../../appium.ts";
import * as control from "../../control.ts";
import * as runner from "../../runner.ts";
import {
  ensureDb,
  persist,
  requireProject,
  saved,
  listProjects,
} from "../infrastructure/repository.ts";
import { normalizeAppPackage } from "../infrastructure/project-source.ts";
import { worker } from "../engines/browser.ts";
import { observe } from "../engines/observe.ts";
let mobileReserved = false;
function hasContent(observation?: Observation) {
  return (
    Array.isArray(observation?.tree) &&
    observation.tree.some((n) => n.text || n.desc)
  );
}
let opening: Promise<unknown> = Promise.resolve();
export function exclusiveDevice<T>(work: () => Promise<T>): Promise<T> {
  const result = opening.catch(() => {}).then(work);
  opening = result;
  return result;
}
export function open(data: NewSession, restore?: PublicSession, takeover = true) {
  return exclusiveDevice(() => openEnvironment(data, restore, takeover));
}
const reconnecting = new Map<string, Promise<Session>>();
export async function ensureActive(id: string, takeover = false): Promise<Session> {
  const pending = reconnecting.get(id);
  if (pending) return pending;
  const current = sessions.get(id);
  if (current && current.state !== "closed") return current;
  const result = (async () => {
    const source = await saved(id);
    if (source.plan) throw new Error("앱 연결과 화면 요소 확인이 필요한 시나리오 초안이에요.");
    await open(
      { ...source, url: source.observation?.url || source.url },
      source,
      takeover,
    );
    return sessions.get(id)!;
  })();
  reconnecting.set(id, result);
  try {
    return await result;
  } finally {
    reconnecting.delete(id);
  }
}
async function openEnvironment(data: NewSession, restore?: PublicSession, takeover = true) {
  await ensureDb();
  const projectId = await requireProject(data.projectId || "default");
  const project = (await listProjects()).find((p) => p.id === projectId);
  if (!restore && !data.parent && project?.demoScenarioIds?.length >= 5)
    throw new Error("데모 시나리오는 최대 5개예요. 기존 시나리오를 수정하거나 재실행해 주세요.");
  const appPackage = normalizeAppPackage(restore?.appPackage || data.appPackage || project?.appPackage);
  const engine = ["web", "mobile-web", "api", "android"].includes(
    data.engine || "",
  )
    ? data.engine!
    : "web";
  if (engine !== "android")
    await prepareTestTarget(String(data.url || "http://127.0.0.1:8081/demo/"));
  if (engine === "android" && takeover) await prepareDeviceTakeover(device.target());
  const browserCapacity = engine === "android" ? 0 : (await worker<{ capacity: number }>("/healthz")).capacity;
  // Reclaim only unattended, idle environments. Running tests and other viewers stay connected.
  for (const old of sessions.values()) {
    const full =
      engine === "android"
        ? mobileReserved
        : [...sessions.values()].filter(
            (s) => s.engine !== "android" && s.state !== "closed",
          ).length >= browserCapacity;
    if (!full) break;
    if (
      old.state !== "closed" &&
      old.state !== "opening" &&
      !old.ai &&
      !old.working &&
      !watching(old.id) &&
      (engine === "android"
        ? old.engine === "android"
        : old.engine !== "android")
    )
      await close(old);
  }
  if (
    engine === "android" &&
    (mobileReserved || runner.busy() || control.snapshot().kind !== "none")
  )
    throw new Error("기기를 다른 실행이 사용하고 있어요");
  if (
    engine !== "android" &&
    [...sessions.values()].filter(
      (s) => s.engine !== "android" && s.state !== "closed",
    ).length >= browserCapacity
  )
    throw new Error(
      `브라우저 ${browserCapacity}개가 실행 중이에요. 사용하지 않는 테스트를 닫아 주세요`,
    );
  if (engine === "android") {
    mobileReserved = true;
    control.lockForRunner("QA Studio");
  }
  const s: Session = {
    id: restore?.id || randomUUID(),
    projectId,
    name: String(data.name || "새 테스트").slice(0, 80),
    engine,
    ...(engine === "android" ? { appPackage } : {}),
    url: restore?.url || String(data.url || "http://127.0.0.1:8081/demo/"),
    state: "opening",
    message: "테스트 환경을 준비해요",
    created: restore?.created || new Date().toISOString(),
    updated: Date.now(),
    steps: restore?.steps || [],
    chat: (restore?.chat || []).map(message => ({ ...message, checklist: message.checklist?.map(item => item.status === "running" ? { ...item, status: "blocked" as const } : item) })),
    verificationPending: restore?.verificationPending,
    scenarioActions: restore?.scenarioActions,
    execution:
      restore?.execution?.status === "running"
        ? { ...restore.execution, status: "interrupted", finished: Date.now() }
        : restore?.execution,
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
      if (appPackage) await appium.launch(s.appiumId, appPackage, false);
      else s.appPackage = normalizeAppPackage(await appium.currentPackage(s.appiumId));
      device.invalidateDump();
    } else
      await worker("/open", {
        id: s.id,
        url: data.url || s.url,
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
  for (const message of s.chat || []) for (const item of message.checklist || []) if (item.status === "running") item.status = "blocked";
  s.epoch++;
  s.ai = false;
  s.state = "paused";
  s.message = "진행 중인 한 동작이 끝나면 직접 조작할 수 있어요";
  await s.tail.catch(() => {});
  await persist(s);
  return publicSession(s);
}
const closing = new WeakMap<Session, Promise<PublicSession>>();
export function close(s: Session): Promise<PublicSession> {
  if (s.state === "closed") return Promise.resolve(publicSession(s));
  const pending = closing.get(s);
  if (pending) return pending;
  const result = closeEnvironment(s).finally(() => closing.delete(s));
  closing.set(s, result);
  return result;
}
async function closeEnvironment(s: Session) {
  await pause(s);
  if (s.appiumId) {
    await appium.close(s.appiumId);
    mobileReserved = false;
    control.unlockRunner();
  } else await worker("/close", { id: s.id });
  s.state = "closed";
  s.message = "실행 환경을 정리했어요. 테스트를 열면 다시 연결돼요";
  await persist(s);
  return publicSession(s);
}
