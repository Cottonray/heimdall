# heimdall design

React + shadcn/ui 기반의 데스크톱 QA 작업 공간. 밝은 중성 배경, 흰 카드, JB 블루 주요 액션, 일관된 선과 간격을 사용한다. 왼쪽은 기록 탐색, 중앙은 실제 실행 화면, 오른쪽은 AI 작성, 아래는 타임라인/디버깅/API 검증이다.

- 의미 색상은 `src/styles.css`의 Tailwind v4 토큰으로 정의한다. 상태 성공은 `success`, 오류는 `destructive`다.
- 전체 화면의 스크롤바는 숨긴다. 본문·사이드바·입력창·대화상자의 휠/터치/키보드 스크롤 동작은 유지한다.
- 클릭 가능한 버튼·목록·탭은 공통 press 토큰으로 살짝 눌리고 부드럽게 복귀한다. 동작 줄이기 설정에서는 이 효과를 생략하고, 좌표 입력을 받는 실행 화면은 크기를 고정한다.
- 상단 소개/연결 배지와 브라우저·Android 자원 현황은 표시하지 않는다. MCP 연결과 AI 상태는 사이드바 하단에 모은다.
- shadcn/ui 공식 registry에서 받은 Button, Badge, Card, Input, Textarea, Label, Tabs, Dialog, Separator, Skeleton을 사용한다. 공통 `cn` 경로와 의미 색상, 성공 Badge variant만 조정했다.
- 컴포넌트 사용부에서 색/모양/내부 여백을 덮어쓰지 않는다. Button은 variant/size를 고른다. CardContent는 컴포넌트 기본 간격을 유지한다.
- 아이콘은 Lucide, 주요 입력은 Label, 아이콘 버튼은 접근 가능한 이름을 가진다. Dialog/Tabs의 포커스와 키보드는 Radix가 처리한다.
- `@shadcn/lint` 6개 규칙: no-restyle, no-raw-colors, no-arbitrary-values, no-inline-styles, no-unknown-classes, require-static-classes. UI 원본 내부에는 restyle/arbitrary/static 예외만 둔다. 임의 색상과 인라인 스타일은 UI 원본에서도 금지한다.
- 예외는 검색 Input의 `pl-9`(검색 아이콘 공간)와 Skeleton 크기다. 나머지 feature 영역은 layout만 지정한다.

공식 근거: [shadcn/ui CLI](https://ui.shadcn.com/docs/cli), [shadcn/lint 규칙](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md).

브랜드: heimdall. 2026-10-08 사용자가 선택한 글자 없는 블루 그라데이션 부엉이를 `src/assets/heimdall.png`에 보관한다. 투명 PNG 원본을 Studio와 쇼룸에서 동일하게 사용한다. 주조색은 로고에 맞춘 `#2667ad`이며 보조·선택 배경도 같은 블루 계열이다. 어두운 테마에서는 `#75ace2`와 짙은 글자로 대비를 확보한다. 입력 테두리와 포커스 색상은 구분된 의미 토큰으로 관리한다.
