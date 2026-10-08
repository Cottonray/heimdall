const allowed = new Set(
  (process.env.AIQA_TEST_ORIGINS || "http://127.0.0.1:8081").split(","),
);
export function checkUrl(value: string) {
  const url = new URL(value);
  if (!allowed.has(url.origin) || url.username || url.password)
    throw new Error("관리자가 등록한 테스트 주소만 열 수 있어요");
  return url.href;
}
