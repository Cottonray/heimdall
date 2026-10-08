import type { Action } from "./types.ts";
export function validateAction(a: Action) {
  if (a?.type === "assert" && !a.text && a.contains)
    a = { ...a, text: a.contains };
  if (
    !a ||
    ![
      "goto",
      "click",
      "point",
      "fill",
      "type",
      "key",
      "scroll",
      "assert",
      "api",
    ].includes(a.type)
  )
    throw new Error("지원하지 않는 동작이에요");
  if (JSON.stringify(a).length > 4000)
    throw new Error("동작 내용이 너무 길어요");
  if (["click", "fill", "assert"].includes(a.type) && !a.text && !a.selector)
    throw new Error("요소를 지정해 주세요");
  if (a.type === "point" && (!Number.isFinite(a.x) || !Number.isFinite(a.y)))
    throw new Error("좌표를 지정해 주세요");
  if (["api", "goto"].includes(a.type) && typeof a.url !== "string")
    throw new Error("주소를 지정해 주세요");
  return structuredClone(a);
}
