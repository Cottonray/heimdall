import type {
  Action,
  DataBinding,
  Session,
  TestDataEntry,
} from "../../../../contracts/studio.ts";
export type BindingTarget = {
  step: number;
  field: DataBinding["field"];
  label: string;
  value: string;
};
export function bindingTargets(source: Session): BindingTarget[] {
  const targets: BindingTarget[] =
    source.engine === "android"
      ? []
      : [{ step: 0, field: "url", label: "시작 주소", value: source.url }];
  for (const step of source.steps) {
    const a = step.action;
    const fields: DataBinding["field"][] =
      a.type === "fill" || a.type === "type"
        ? ["value"]
        : a.type === "goto"
          ? ["url"]
          : a.type === "api"
            ? ["url", "status", "contains"]
            : a.type === "assert" && (a.text || a.contains)
              ? [a.text ? "text" : "contains"]
              : [];
    for (const field of fields)
      targets.push({
        step: step.n,
        field,
        label: `${step.n}단계 · ${{ url: "주소", value: "입력 값", text: "기대 문구", contains: "응답 포함 값", status: "기대 상태 코드" }[field]}`,
        value: String(a[field] ?? ""),
      });
  }
  return targets;
}
export function dataFields(
  entry: TestDataEntry,
): { path: string; label: string; value: string | number | boolean }[] {
  const result: ReturnType<typeof dataFields> = [];
  const visit = (value: unknown, path: string, label: string, depth = 0) => {
    if (depth > 12 || result.length >= 500) return;
    if (["string", "number", "boolean"].includes(typeof value)) {
      result.push({ path, label, value: value as string | number | boolean });
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value))
        visit(
          child,
          path + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1"),
          label ? label + "." + key : key,
          depth + 1,
        );
    }
  };
  visit(entry.customerNumber, "/customerNumber", "고객번호");
  visit(entry.name, "/name", "데이터 이름");
  visit(entry.tags, "/tags", "태그");
  visit(JSON.parse(entry.content), "/content", "");
  return result;
}
export function bindActions(
  source: Session,
  entry: TestDataEntry,
  bindings: DataBinding[],
) {
  if (!Array.isArray(bindings) || !bindings.length || bindings.length > 500)
    throw new Error("테스트데이터를 적용할 입력·검증 항목을 선택해 주세요.");
  const targets = bindingTargets(source);
  const fields = dataFields(entry);
  const actions: Action[] = source.steps.map((step) =>
    structuredClone(step.action),
  );
  let url = source.url;
  const used = new Set<string>();
  for (const binding of bindings) {
    if (
      !binding ||
      !Number.isInteger(binding.step) ||
      typeof binding.path !== "string"
    )
      throw new Error("데이터 적용 항목을 확인해 주세요.");
    const key = `${binding.step}:${binding.field}`;
    const target = targets.find(
      (item) => item.step === binding.step && item.field === binding.field,
    );
    const field = fields.find((item) => item.path === binding.path);
    if (!target || !field || used.has(key))
      throw new Error("시나리오와 테스트데이터의 연결을 다시 확인해 주세요.");
    used.add(key);
    if (binding.step === 0) {
      url = String(field.value);
      continue;
    }
    const index = source.steps.findIndex((step) => step.n === binding.step);
    if (binding.field === "status") {
      const status = Number(field.value);
      if (!Number.isInteger(status) || status < 100 || status > 599)
        throw new Error("기대 상태 코드는 100~599 숫자여야 해요.");
      actions[index]!.status = status;
    } else actions[index]![binding.field] = String(field.value);
  }
  return { url, actions };
}
