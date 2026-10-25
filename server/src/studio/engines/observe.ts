import type { Session, Observation } from "../domain/types.ts";
import * as device from "../../device.ts";
import * as appium from "../../appium.ts";
import { worker } from "./browser.ts";
import { WORKER } from "../infrastructure/config.ts";
export async function observe(s: Session) {
  if (s.engine === "android") {
    s.observation = {
      serial: device.target(),
      tree: (await appium.source(s.appiumId!))
        .filter((n) => n.package === (s.appPackage || device.APP_ID))
        .map((n) => ({
          text: n.text,
          selector: n.id,
          desc: n.desc,
          bounds: n.bounds,
        })),
      ...(await device.screenSize()),
    };
  } else s.observation = await worker<Observation>(`/observe?id=${s.id}`);
  return s.observation;
}
export async function frame(s: Session) {
  if (s.engine === "android") {
    const b = await device.screenshotJpeg(720, 6);
    if (!b) throw new Error("기기 화면을 읽지 못했어요");
    return b;
  }
  const r = await fetch(`${WORKER}/frame?id=${s.id}`, {
    signal: AbortSignal.timeout(10000),
    headers: {
      authorization: "Bearer " + (process.env.AIQA_WORKER_SECRET || ""),
    },
  });
  if (!r.ok) throw new Error("화면 연결이 끊겼어요");
  return Buffer.from(await r.arrayBuffer());
}
