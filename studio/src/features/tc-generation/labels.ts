import type { TcCondition, TcIssue, TcOrigin, TcRun, TcStage, TcType } from "../../../../contracts/studio";

export const typeLabel: Record<TcType, string> = { normal: "정상 흐름", exception: "오류 상황", boundary: "기준값" };
export const originLabel: Record<TcOrigin, string> = { ai: "AI 작성", rule: "자동 계산", pattern: "상품 패턴" };
export const kindLabel: Record<TcCondition["kind"], string> = { input: "입력값", branch: "조건별 갈림", boundary: "기준값", rule: "업무 규칙" };
export const levelLabel: Record<TcIssue["level"], string> = { error: "오류", warning: "주의", info: "참고" };
export const stageLabel: Record<TcStage, string> = {
  normalize: "명세 정리",
  extract: "확인할 조건 찾기",
  generate: "테스트케이스 작성",
  verify: "점검·요구사항 연결",
};
export const stages: TcStage[] = ["normalize", "extract", "generate", "verify"];
export const statusLabel: Record<TcRun["status"], string> = { running: "생성 중", done: "생성 완료", failed: "실패" };
export const domainLabel = { deposit: "수신", loan: "여신" } as const;
export const errorText = (e: unknown) =>
  (e instanceof Error ? e.message : "요청을 처리하지 못했어요").replace(/^Error:\s*/, "");
export const when = (at: number) => new Date(at).toLocaleString("ko-KR");

// 가상 은행 화면 기준의 예시. 실제 기관의 명세가 아니다.
export const SAMPLE_REQUIREMENTS = `# 모바일 계좌이체
SR-2101 1회 이체 금액은 최소 1원, 최대 500만원까지 입력할 수 있다
SR-2102 1일 누적 이체 금액이 1,000만원을 초과하면 이체를 막고 한도 초과 안내 팝업을 띄운다
SR-2103 받는 계좌번호는 숫자 10~14자리만 입력할 수 있다
SR-2104 이체 비밀번호를 5회 이상 틀리면 이체 비밀번호를 잠그고 영업점 방문을 안내한다
SR-2105 받는 분 이름이 예금주와 다르면 확인 팝업을 띄우고, 확인을 누른 경우에만 이체를 진행한다
SR-2106 매일 23:30부터 00:30까지는 시스템 점검으로 이체할 수 없다는 안내를 보여 준다
SR-2107 이체가 완료되면 거래번호와 이체 결과 화면을 보여 주고 앱 알림을 보낸다`;

export const SAMPLE_PATTERN_SPEC = `# 가상 청년 전세자금대출 심사 기준
- 신청 나이는 만 19세 이상 34세 이하
- 신청금액은 500만원 이상 2억원 이하, 1만원 단위
- 신용점수가 650점 미만이면 신용점수 미달로 부결한다
- 연소득이 5천만원을 초과하면 소득 기준 초과로 부결한다
- 무주택 여부가 아니오이면 주택 보유로 부결한다
- 임차보증금이 3억원을 초과하면 보증금 한도 초과로 부결한다`;
