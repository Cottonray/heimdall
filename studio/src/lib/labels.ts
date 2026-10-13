import type {
  Action,
  Engine,
  SessionState,
  Session,
} from "../../../contracts/studio";
export const engines: Record<
  Engine,
  { label: string; tool: string; description: string }
> = {
  web: {
    label: "웹",
    tool: "Playwright",
    description: "브라우저 화면과 업무 흐름",
  },
  "mobile-web": {
    label: "웹 · 모바일",
    tool: "Playwright",
    description: "모바일 화면과 터치 흐름",
  },
  android: {
    label: "앱",
    tool: "Appium · Android",
    description: "연결된 기기의 네이티브 앱",
  },
  api: {
    label: "API",
    tool: "Playwright",
    description: "응답 코드와 데이터 검증",
  },
};
export function runStatus(s: Session) {
  if (s.plan) return "초안 · 미실행";
  const execution = s.execution;
  if (!execution)
    return s.steps.some((step) => !step.ok || step.error)
      ? "실패"
      : s.state === "closed"
        ? "종료"
        : "작성 중";
  if (execution.status === "running" && s.state === "closed") return "중단";
  return {
    running: "실행 중",
    passed: "통과",
    completed: "완료 · 검증 없음",
    failed: "실패",
    interrupted: "중단",
  }[execution.status];
}
export const states: Record<SessionState, string> = {
  opening: "준비 중",
  manual: "직접 조작",
  ai: "AI 실행 중",
  replay: "재실행 중",
  paused: "일시 정지",
  passed: "검증 통과",
  closed: "종료",
};
export function actionLabel(a: Action) {
  const names: Record<string, string> = {
    click: "클릭",
    point: "화면 선택",
    fill: "입력",
    type: "입력",
    key: "키 입력",
    scroll: "스크롤",
    assert: "결과 검증",
    api: "API 검증",
    goto: "페이지 이동",
  };
  return {
    verb: names[a.type] || a.type,
    target:
      a.text || a.selector || a.url || a.value || a.key || a.direction || "",
    value: a.type === "fill" ? a.value : undefined,
  };
}
export const defaultGoal =
  "이체 화면에서 김테스트에게 1만원을 입력하고, 입력 확인 완료가 표시되는지 검증해 줘.";
