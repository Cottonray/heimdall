# heimdall design

React + shadcn/ui 기반의 QA 워크스페이스. 현재 디자인의 정본은 이 문서, `src/components/ui`, `src/styles.css`이며 화면별 스타일 복사본을 만들지 않는다.

## 화면과 브랜드

- 브랜드는 소문자 `heimdall`. 사이드바와 로그인 헤더는 부엉이와 이름이 붙은 `HeimdallWordmark`를 사용한다. 표시 영역은 후속 요청으로 144×40px에서 128×36px로 줄였다. 파비콘은 글자 없는 부엉이 원본을 사용한다. 밝은 모드의 검정 글자는 `src/assets/heimdall-wordmark.png`, 다크 모드의 밝은 글자는 `src/assets/heimdall-wordmark-dark.png`이며 부엉이 블루는 유지한다. 글자 없는 부엉이 원본 `src/assets/heimdall.png`는 쇼룸·아이콘 용도로 보존한다.
- 라이트 테마는 흰 배경과 `#2667ad` JB 계열 블루, 다크 테마는 짙은 배경과 `#75ace2`를 사용한다. 실제 색상 값은 `src/styles.css`의 의미 토큰에서만 정의한다.
- 로그인 페이지 → 프로젝트 목록 → 프로젝트 워크스페이스 순서다. 사이드바는 대시보드·워크스페이스·도메인·테스트 기록 메뉴, 상단은 열린 화면의 탭과 프로필이다.
- 본문은 남은 화면 전체를 사용한다. 소개 배너, 실시간 연결 배지, 홈서버·샘플 금융 거래 문구, AI 쇼룸 링크, AI 사용 가능 문구는 추가하지 않는다.
- 사이드바 하단에는 테마와 설정을 둔다. MCP 연결 정보는 설정 화면에서 제공한다.

## 공통 컴포넌트

공식 shadcn CLI/registry 컴포넌트를 기준으로 한다. 제품에 필요한 확장은 아래 공통 컴포넌트의 variant/size로 관리한다.

| 요소 | 정본 | 사용 규격 |
| --- | --- | --- |
| 액션·메뉴·아이콘 | `Button` | `variant`와 `size`; 로고 홈 버튼은 `brand` 크기 |
| 프로젝트 카드 | `Item` | `variant="project" size="project" asChild` |
| 테스트 목록·최근 테스트 | `Item` | `variant="row" size="row" asChild` |
| 입력·검색·장문 | `Input`, `SearchInput`, `Textarea` | 검색 아이콘과 입력 여백은 `SearchInput` 내부에서 관리 |
| 폼 라벨 | `Label` | 기본 또는 `subtle` variant |
| 테마 전환 | `Select`, `ThemeControls` | 테두리·그림자 없는 `SelectTrigger variant="ghost"`; 사이드바와 설정에서 동일한 조작부 |
| 카드·상태·탭·대화상자 | `Card`, `Badge`, `Tabs`, `Dialog` | 공통 기본 간격과 의미 variant |
| 차트·로딩·구분선 | `Chart`, `Skeleton`, `Separator` | 의미 색상 및 레이아웃 속성 |
| 원격 화면 입력 | `PreviewSurface` | 좌표 보존을 위해 패딩·눌림 축소·disabled 투명도 없음 |

`Item asChild` 내부의 실제 `button`은 의미와 이벤트만 담당한다. 화면 코드에서 버튼 클래스, 기본 HTML 입력·대화상자, 별도 CSS를 작성하지 않는다. 외부 레이아웃은 정적 Tailwind 클래스로 지정하고 공통 컴포넌트의 색·모양·내부 여백은 사용부에서 덮어쓰지 않는다. 새로운 모양이 필요하면 공통 variant를 추가한다.

간격은 Tailwind 기본 스케일, 색은 `background/foreground`, `primary`, `muted`, `border/input/ring`, `success/destructive`, `sidebar` 토큰을 쓴다. 상태는 색뿐 아니라 텍스트로도 전달한다. 아이콘은 Lucide를 사용하고 입력에는 라벨, 아이콘 버튼에는 접근 가능한 이름을 제공한다. Radix가 Dialog/Tabs/Select의 키보드 및 포커스를 처리한다.

## 테마와 동작

- 하나의 `화면 테마` 드롭다운에서 `라이트 모드`, `다크 모드`, `시스템 설정 따르기`를 선택한다. 사이드바와 설정 화면이 같은 선택을 표시한다.
- `시스템 설정 따르기`를 선택하면 OS의 `prefers-color-scheme` 변경을 자동 반영한다. 다른 두 옵션은 표시 테마를 직접 지정한다.
- `heimdall.theme`에 `light`, `dark`, `system` 중 선택을 저장한다. 기존 선택은 보존하며 처음 사용할 때는 라이트다. 로그인 화면에도 선택이 적용된다.
- 공통 press 토큰으로 클릭 피드백을 제공하고 `prefers-reduced-motion`에서는 생략한다. 원격 화면 좌표 입력에는 축소 효과를 적용하지 않는다.
- 스크롤바는 숨기되 본문·사이드바·입력창·대화상자의 휠·터치·키보드 스크롤은 유지한다.

## 자동 검사

`@shadcn/lint`의 6개 규칙을 모두 오류로 처리한다.

| 규칙 | 차단 대상 |
| --- | --- |
| `no-restyle` | 공통 컴포넌트의 색·모양·내부 간격 덮어쓰기 |
| `no-raw-colors` | 임의 팔레트·색상·SVG 색상 |
| `no-arbitrary-values` | `p-[13px]` 등의 임의 값 |
| `no-inline-styles` | 인라인 스타일과 style 태그 |
| `no-unknown-classes` | Tailwind가 생성할 수 없는 클래스 |
| `require-static-classes` | 검사할 수 없는 동적 컴포넌트 클래스 |

공통 UI 원본에만 restyle/arbitrary/static 예외가 있다. 색상·인라인 스타일 검사는 공통 UI에도 적용한다. 검색창의 `pl-9` 예외는 제거했으며 feature 영역에는 스타일 예외를 두지 않는다. ESLint 인라인 해제 주석으로 규칙을 우회할 수 없다.

`verify-design-lint.ts`는 각 규칙의 독립 위반 사례, 기본 HTML 컨트롤 우회, 공통 UI 예외 범위, 올바른 토큰·variant 사용을 검증한다. `yarn check`와 `../check.ts`는 strict TypeScript, ESLint, hooks·접근성, 디자인 규칙과 검출 검사, 기존 테스트를 통과해야 빌드를 생성한다. `../deploy.sh`도 이 검사를 배포 전에 실행한다.

공식 근거: [shadcn/ui CLI](https://ui.shadcn.com/docs/cli), [shadcn/lint 규칙](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md).
