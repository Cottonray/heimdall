import type { Session, Action } from "../domain/types.ts";
import * as device from "../../device.ts";
import * as appium from "../../appium.ts";
export async function android(s: Session, a: Action) {
  const id = s.appiumId!;
  const find = () =>
    a.selector
      ? appium.findId(id, a.selector)
      : appium.findText(id, String(a.text || ""));
  switch (a.type) {
    case "click": {
      const el = await find();
      if (!el) throw new Error("요소를 찾지 못했어요");
      await appium.click(id, el);
      break;
    }
    case "point": {
      const nodes = await appium.source(id),
        x = Number(a.x),
        y = Number(a.y);
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw new Error("잘못된 좌표예요");
      const n = nodes
        .filter(
          (n) =>
            x >= n.bounds.left &&
            x <= n.bounds.right &&
            y >= n.bounds.top &&
            y <= n.bounds.bottom &&
            (n.id || n.text),
        )
        .sort(
          (a, b) =>
            (a.bounds.right - a.bounds.left) *
              (a.bounds.bottom - a.bounds.top) -
            (b.bounds.right - b.bounds.left) * (b.bounds.bottom - b.bounds.top),
        )[0];
      await appium.clickPoint(id, x, y);
      if (n)
        Object.assign(a, {
          type: "click",
          ...(n.id ? { selector: n.id } : { text: n.text }),
        });
      break;
    }
    case "fill": {
      const el = await find();
      if (!el) throw new Error("입력칸을 찾지 못했어요");
      await appium.click(id, el);
      await appium.clearActive(id);
      await appium.typeActive(id, String(a.value || ""));
      break;
    }
    case "type":
      await appium.typeActive(id, String(a.value || ""));
      break;
    case "key":
      if (a.key === "Back") await appium.back(id);
      else if (a.key === "Enter") await appium.pressKeyCode(id, 66);
      else throw new Error("Back 또는 Enter만 지원해요");
      break;
    case "scroll":
      await appium.swipe(
        id,
        a.direction === "up" ? "down" : "up",
        await device.screenSize(),
      );
      break;
    case "assert":
      if (!(a.text ? await appium.findText(id, a.text) : await find()))
        throw new Error(`확인 실패: ${a.text || a.selector}`);
      break;
    default:
      throw new Error("Android에서 지원하지 않는 동작이에요");
  }
  device.invalidateDump();
}
