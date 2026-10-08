import type { Action } from "../../contracts/studio.ts";
import { get } from "./sessions.ts";
import { checkUrl } from "./policy.ts";
import { observe } from "./observe.ts";
export async function operate(id: string, a: Action) {
  const s = get(id),
    p = s.page;
  const locator = () =>
    a.selector
      ? p.locator(String(a.selector)).first()
      : p.getByText(String(a.text), { exact: true }).first();
  switch (a.type) {
    case "goto":
      await p.goto(checkUrl(String(a.url)), { waitUntil: "domcontentloaded" });
      break;
    case "click":
      await locator().click();
      break;
    case "point": {
      const x = Number(a.x),
        y = Number(a.y);
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw new Error("잘못된 좌표예요");
      // Capture a stable selector BEFORE navigation; the recorded action remains replayable.
      const target = await p.evaluate(
        ({ x, y }) => {
          const el = document
            .elementFromPoint(x, y)
            ?.closest(
              'button,a,input,select,textarea,[role="button"]',
            ) as HTMLElement | null;
          if (!el) return null;
          if (el.id) return { selector: "#" + CSS.escape(el.id) };
          if (el.getAttribute("data-testid"))
            return {
              selector:
                "[data-testid=" +
                JSON.stringify(el.getAttribute("data-testid")) +
                "]",
            };
          return el.textContent?.trim()
            ? { text: el.textContent.trim() }
            : null;
        },
        { x, y },
      );
      await p.mouse.click(x, y);
      if (target) Object.assign(a, { type: "click", ...target });
      break;
    }
    case "fill":
      await locator().fill(String(a.value ?? ""));
      break;
    case "type":
      await p.keyboard.insertText(String(a.value ?? ""));
      break;
    case "key":
      await p.keyboard.press(String(a.key));
      break;
    case "scroll":
      await p.mouse.wheel(0, a.direction === "up" ? -550 : 550);
      break;
    case "assert":
      await (
        a.text
          ? p.getByText(String(a.text), { exact: false }).first()
          : locator()
      ).waitFor({ state: "visible", timeout: 6000 });
      break;
    case "api": {
      const r = await s.context.request.get(checkUrl(String(a.url)), {
        maxRedirects: 0,
        timeout: 10000,
      });
      const status = r.status();
      if (status !== Number(a.status ?? 200))
        throw new Error(`API 응답 ${status}, 기대값 ${a.status ?? 200}`);
      const content = (await r.text()).slice(0, 8000);
      if (a.contains && !content.includes(String(a.contains)))
        throw new Error("API 응답에서 기대한 값을 찾지 못했어요");
      return { action: a, status, body: content };
    }
    default:
      throw new Error("지원하지 않는 브라우저 동작이에요");
  }
  return { action: a, ...(await observe(p)) };
}
