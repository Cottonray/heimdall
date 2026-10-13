let allowed = new Set(
  (process.env.AIQA_TEST_ORIGINS || "http://127.0.0.1:8081").split(","),
);
export function checkUrl(value: string) {
  const url = new URL(value);
  if (!allowed.has(url.origin) || url.username || url.password)
    throw new Error("관리자가 등록한 테스트 주소만 열 수 있어요");
  return url.href;
}

export function configureOrigins(values: unknown) {
  if (
    !Array.isArray(values) ||
    values.length > 10000 ||
    !values.every(
      (v) =>
        typeof v === "string" &&
        ["http:", "https:"].includes(new URL(v).protocol) &&
        new URL(v).origin === v,
    )
  )
    throw new Error("잘못된 도메인 설정이에요");
  allowed = new Set(values);
}
