# HEIMDALL 원격 조작 지연 개선 — 2026-10-09

## 측정 범위

공개 HEIMDALL에 로그인한 테스트 세션에서 원격 기기 WebSocket을 사용했다. Android는 홈서버 emulator-5554, iOS는 Mac의 iPhone 17 Pro Simulator(iOS 26.2)다. 실물 iPhone 측정 결과가 아니다. 테스트 중에는 기기 점유를 획득하고 끝나면 해제했다.

| 지표 | Android | iOS |
|---|---:|---:|
| 개선 전 홈 명령 완료 RTT 중앙값 (각 5회) | 134ms | 1,917ms |
| 개선 후 홈 명령 완료 RTT 중앙값 (각 20회) | 120ms | 115.5ms |
| 개선 후 홈 명령 완료 RTT p95 (각 20회, nearest rank) | 170ms | 184ms |

이는 명령 완료 응답까지의 시간이다. 영상 디코딩·브라우저 표시까지의 시간으로 해석하지 않는다.

화면 반영은 양쪽에 같은 pointerdown 흑백 전환 코드를 넣고, 새 원격 UI와 동일하게 touch down → 50ms 뒤 up을 보냈다. 바뀐 픽셀을 포함한 프레임이 측정 클라이언트에 도착한 시점을 비교했다. 브라우저 paint 시간은 제외한다. 각 10회이며 네트워크 변동을 포함한다.

| 최종 실제 입력 경로 | Android | iOS |
|---|---:|---:|
| 화면 변화 프레임 도착 중앙값 | 169.5ms | 174.5ms |
| 최대 | 260ms | 288ms |

- Android 원시값(ms): 260, 204, 157, 172, 164, 223, 205, 153, 152, 167.
- iOS 원시값(ms): 146, 172, 134, 204, 288, 161, 144, 261, 274, 177.
- 최종 iOS 영상: idb 60fps 상한, scale 0.3, quality 0.3, 구독 기반 push. 최대 128KB 적체에서 오래된 프레임을 버린다.
- 이전 단발 tap API는 다른 입력 경로다. 중간 30fps pull 실험의 iOS 중앙값 231ms, 60fps push에서 기존 tap 20회 중앙값 237.5ms와 실제 UI의 연속 touch 결과를 혼합하지 않는다.

## 변경

- Android: scrcpy H.264/WebCodecs 영상과 scrcpy 제어 소켓을 Studio 원격 화면에 연결했다. 디코더 적체와 오래된 JPEG 그리기를 제한했다.
- iOS: 매번 Appium 준비·화면 크기 조회·XCTest 입력을 거치던 경로를 줄이고, Simulator 입력은 idb HID, 영상은 idb framebuffer MJPEG로 전달한다. 텍스트·웹 컨텍스트 작업과 영상·네이티브 입력의 큐를 분리했다.
- Mac agent: 인증된 지속 WebSocket, 선택적인 기존 SSH 별칭의 loopback 중계로 추가 공개 프록시 왕복을 줄였다. 기존 SSH 신뢰를 사용하며 새 공개 포트나 자격증명을 만들지 않았다.
- 연속 터치: down/move/up/cancel을 각각 전송한다. 응답 대기는 3개로 제한하고 밀린 move만 최신 좌표로 대체한다. 창 전환·연결 종료·응답 시간 초과에 눌린 손가락을 해제한다.
- 터치 표시: 24px 반투명 원(primary 25%)이 누른 위치를 따라가며, 손을 떼면 300ms 동안 사라진다. 원본 기기 캡처에는 포함되지 않는다.
- iOS 웹 디버깅: 공용 웹 인스펙터에서 Safari 및 검사 가능한 WKWebView를 선택한다. Safari Elements DOM과 Runtime.evaluate를 실제 연결로 확인했다.

## 검증

- 전체 Studio check: 화면·서버·워커·에이전트 strict 타입 검사, ESLint, 디자인 규칙, 회귀 테스트, 프로덕션 빌드 통과.
- 연속 터치 회귀: 이벤트 순서, 이동 병합, 해제 보존, 시간 초과, 연결 종료의 해제를 검사한다.
- iOS 실제 입력: 마우스 해제 전 `{down:1,move:9,up:0}`, 해제 후 `{down:1,move:9,up:1}`을 Safari에서 관찰했다. 실제 원격 웹 화면의 드래그와 터치 오버레이 DOM도 확인했다.
- Android 실제 입력: 마우스 해제 전 `{down:1,move:8,up:0}`, 해제 후 `{down:1,move:8,up:1}`을 WebView에서 관찰했다. 원격 UI 클릭으로 샘플 웹뷰에 진입하는 것도 확인했다.
- 에이전트의 소유 SSH 중계 프로세스를 종료한 뒤 자동 재접속을 확인했다. 새 프레임 구독·중단·인증은 실제 WebSocket 회귀 테스트로 검증했다.
- idb가 없는 설치의 터치는 기존 XCTest 탭/스와이프로, WebCodecs 미지원 브라우저는 JPEG/ADB 입력으로 호환한다. 이 경우 연속 드래그는 지원하지 않으며 idb 설치가 필요하다. 현재 검증한 Mac에는 idb가 설치되어 있다.
- 분리 전 상위 모노레포 문서 링크 검사에는 작업 범위 밖 기존 오류 17개가 남아 있었다. 이번 범위의 오래된 copy.json과 에이전트 설정 경로 서술은 수정했다.

## 구현 근거

- [Meta idb](https://github.com/facebook/idb): Simulator의 HID와 영상 스트림.
- [idb HID 프로토콜](https://github.com/facebook/idb/blob/main/proto/idb.proto): DOWN/UP 및 좌표 메시지.
- [Appium XCUITest 설정](https://github.com/appium/appium-xcuitest-driver/blob/master/docs/reference/settings.md): idle/animation 및 MJPEG 설정.
