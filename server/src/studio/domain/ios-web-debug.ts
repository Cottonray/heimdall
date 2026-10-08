export type IosWebDebug = {
  context: string;
  operation: "dom" | "evaluate" | "resources";
  expression?: string;
};
export function iosWebDebug(value: unknown): IosWebDebug {
  if (!value || typeof value !== "object")
    throw new Error("웹 디버깅 요청을 확인해 주세요");
  const item = value as Record<string, unknown>;
  if (
    typeof item.context !== "string" ||
    !/^WEBVIEW_[A-Za-z0-9_.:-]{1,160}$/.test(item.context)
  )
    throw new Error("디버깅할 웹페이지를 선택해 주세요");
  if (!["dom", "evaluate", "resources"].includes(String(item.operation)))
    throw new Error("지원하지 않는 요청이에요");
  if (
    item.operation === "evaluate" &&
    (typeof item.expression !== "string" ||
      !item.expression.trim() ||
      item.expression.length > 10000)
  )
    throw new Error("JavaScript는 1~10,000자로 입력해 주세요");
  return {
    context: item.context,
    operation: item.operation as IosWebDebug["operation"],
    ...(typeof item.expression === "string"
      ? { expression: item.expression }
      : {}),
  };
}
