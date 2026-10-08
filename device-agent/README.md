# Heimdall 기기 에이전트

슬레이브에서 `heimdall server --master https://마스터주소`를 실행한다. 연결은 슬레이브 → 마스터 HTTPS/WSS 연결만 사용한다. 공개 포트와 SSH는 필요하지 않다. 10초 동안 heartbeat가 없으면 마스터가 해당 기기를 오프라인으로 표시한다.

## macOS 아키텍처

동일한 ZIP이 Apple Silicon(arm64)과 Intel(x64)을 지원한다. 실행 파일은 Node.js용 JavaScript 번들이며 특정 CPU용 바이너리를 포함하지 않는다. 각 Mac 아키텍처에 맞는 Node.js와 Xcode/Simulator, Appium을 설치하고 PATH에서 실행한다. Simulator 런타임은 해당 Mac의 Xcode가 지원하는 버전을 사용한다. Apple Silicon에서 원격 연결을 확인했으며 Intel 실기기 실행은 아직 확인하지 않았다.

## macOS 설치

현재 패키지는 Node.js 22.18+에서 실행하는 CLI다. Node, Xcode/Simulator, Appium 3와 XCUITest 드라이버, 저지연 입력용 idb-companion가 사전에 설치되어 있어야 한다. 폐쇄망에서는 이 도구들과 Simulator runtime도 반입해야 한다. 이 ZIP만으로 모든 의존성이 설치되지는 않는다.

1. ZIP을 풀고 `heimdall` 파일을 PATH에 두고 실행 권한을 준다.
2. `brew tap facebook/fb && brew install facebook/fb/idb-companion`으로 시뮬레이터 입력 도구를 설치한다.
3. `~/.config/heimdall/agent.json`에 아래 내용을 저장한다.
4. 관리자가 발급한 토큰을 `tokenFile`에 저장하고 해당 사용자만 읽게 한다.
5. Simulator를 부팅한 뒤 `heimdall server --master https://마스터주소`를 실행한다.

```json
{"id":"mac-01","tokenFile":"/Users/사용자/.config/heimdall/token","device":"SIMULATOR-UUID"}
```

`heimdall server --master ... --config /path/agent.json`으로 설정 경로를 바꿀 수 있다. Appium이 없다면 CLI가 실행 오류를 안내하며, 설치되어 있으면 loopback 4725에서 시작한다. 작업 종료는 Ctrl+C다. Mac 절전/네트워크 해제 때 자동 재접속한다. 평문 HTTP는 격리된 신뢰망에서만 사용하고 일반 연결은 HTTPS를 사용한다.

## 마스터 등록

마스터의 `/opt/aiqa/server/agents.local.json` 또는 `HEIMDALL_AGENTS_FILE`에 에이전트별 ID, 토큰 SHA-256 해시, 허용된 serial을 등록한다. 토큰 원문은 서버 응답/배포 패키지에 포함하지 않는다. 설정은 요청마다 읽으므로 수정 후 서버 재시작은 필요 없다.

```json
{"agents":[{"id":"mac-01","tokenHash":"TOKEN_SHA256_HEX","serials":["ios:SIMULATOR-UUID"]}]}
```

서버 실행 계정이 이 설정을 읽을 수 있어야 한다. 같은 serial을 여러 에이전트에 허용하지 않는다. 사용자 브라우저는 기존 Heimdall 로그인과 기기 점유 권한을 그대로 사용한다. 마스터는 prepare/frame/action/webviews/web-debug 요청만 전송한다. 웹 디버깅 코드는 선택한 웹페이지 안에서 실행하며 호스트 쉘에는 전달하지 않는다.

## 지원 범위

현재 macOS iOS Simulator의 화면, 탭, 스와이프, 홈, 텍스트/삭제, 화면 캡처·녹화를 연결한다. Safari·검사 가능한 WKWebView를 공통 Chrome DevTools 패널에 연결한다. 기존 Appium DOM/JavaScript API는 이전 클라이언트의 호환 경로로 남긴다. iOS 웹 인스펙터는 아래 inspect-webkit 브리지를 사용한다. 잠금·볼륨·최근 앱 버튼은 화면에서 지원하지 않는다. Windows용 Android adapter/패키지는 준비 중이며 iOS Simulator는 macOS 전용이다.

## 개발/빌드

`node deploy/aiqa/device-agent/build.ts` (저장소 루트). 빌드에는 기존 studio의 esbuild가 필요하지만 생성된 CLI는 JS 의존성을 번들에 포함한다. 회귀검사는 이 명령에서 실행하지 않는다.

현재 연결 Mac은 Xcode 26.2 / XCUITest 12.16.0이다. Xcode 26.2에 없는 lib_TestingInterop.dylib의 WDA 프로젝트 복사 항목을 로컬 설치본에서 제외해 WDA를 빌드했다. 다른 Mac은 Xcode와 드라이버의 호환성을 확인해야 한다. Xcode 자체나 서명 자격증명은 변경하지 않았다.

운영 관리자 화면의 기기관리에서 macOS ZIP을 받을 수 있다. 에이전트 다운로드 API는 관리자 세션을 확인한다. 화면은 idb Simulator 영상(30fps 상한, 30% 축소, 품질 0.30)의 최신 JPEG를 전송한다. 직접 영상이 실패하거나 idb가 없으면 WDA MJPEG(15fps 상한, 30% 축소, 품질 30)로 전환한다. 각 프레임은 500KB 이하이며 오래된 프레임은 쌓지 않는다. 현재 Mac에는 사용자 LaunchAgent로 실행되어 로그인 상태에서 재접속한다. Windows 배포물은 아직 제공하지 않는다.

2026-10-08 운영 반영: 로컬 Mac의 iPhone 17 Pro가 공개 마스터에 등록되고 웹 원격 화면으로 수신되는 것을 확인했다. 에이전트는 사용자 LaunchAgent `com.example.heimdall-agent`로 유지한다. 회귀검사는 실행하지 않았고 studio 빌드와 서버 TypeScript 컴파일만 수행했다.

## 저지연 경로 (2026-10-09)

에이전트는 `/aiqa/studio/ws?agent=1`로 지속 연결하고 첫 프레임에서 토큰을 검증한다. 명령·결과는 같은 연결로 즉시 전달하고 4초마다 기기 목록을 갱신한다. URL이나 로그에는 토큰을 남기지 않는다. 마스터는 30초마다 토큰 폐기와 허용 serial 변경을 확인하며 연결 해제 시 진행 중 요청을 실패 처리한다. 이전 에이전트의 HTTP long poll도 호환 경로로 유지한다. 화면은 idb의 Simulator framebuffer MJPEG 한 연결에서 메모리로 수신해 화면별 스크린샷 RPC·PNG 파일·sips 변환을 제거했다. 마지막 화면 요청 뒤 3초가 지나면 영상 연결을 종료한다. 수동 조작 세션은 idle/animation 대기를 끄고 Appium 텍스트 입력과 기존 Appium 웹 디버깅 API를 직렬화한다. 탭·스와이프·홈 입력은 Meta idb-companion의 Simulator HID로 전달해 XCTest 대기를 거치지 않는다. 입력은 순서를 유지하며 영상·웹 디버깅과 독립적으로 처리한다. 에이전트가 전용 idb 프로세스를 시작하고 종료 때 정리한다. RPC는 임시 비공개 디렉터리의 Unix socket으로만 열린다. Apple Silicon/Intel Homebrew 위치를 탐색하며 `HEIMDALL_IDB_COMPANION`으로 경로를 지정할 수 있다. 미설치 환경은 경고 후 느린 XCTest 입력으로 돌아간다. 기존 Appium 웹 작업 뒤에는 NATIVE_APP으로 반드시 복귀한다. 공통 DevTools 브리지는 이 큐와 별개다.

WKWebView는 앱이 `isInspectable = true`로 허용한 페이지만 보인다. iOS 목록은 최초 연결과 새로고침 때 조회하여 주기적인 WebKit 탐색이 터치를 막지 않게 한다. JavaScript 실행은 현재 기기 점유와 로그인 확인을 통과해야 하며 동시에 한 요청만 허용한다.

## 앱 설치

관리자 앱 관리에 시뮬레이터용 .app을 ZIP으로 압축해 업로드하면 원격 화면 앱 설치 탭에서 설치할 수 있어요. APK와 iOS ZIP은 기기 플랫폼별로 나눠 보여줘요. 파일당 최대 300MB이며 최상위에 .app 하나를 넣어 주세요. IPA 실기기 설치는 지원하지 않아요. 설치 후 앱을 자동 실행하지 않아요.

## iOS 웹 인스펙터

inspect-webkit 0.0.5(MIT)를 포함하며 Safari/WKWebView를 Chrome DevTools에 연결해요. 인스펙터는 현재 지정한 시뮬레이터 한 대만 부팅한 상태에서 지원해요. 로컬 브리지는 127.0.0.1:9237에만 바인딩하고 원격 연결은 기존 인증된 에이전트 채널을 사용해요. WKWebView는 앱에서 검사 허용 설정이 필요해요.

같은 운영자가 이미 SSH로 관리하는 홈서버라면 설정에 `"relaySsh":"heimdall-host"`처럼 **기존 SSH 별칭**을 선택적으로 넣을 수 있다. 공개 프록시를 왕복하는 대신 기존 SSH 인증·known_hosts 검증을 유지하는 암호화 터널로 마스터 컨테이너의 8080에 연결한다. 리스너는 임의의 `127.0.0.1` 포트에만 열리고 공개 포트·방화벽·계정 권한은 변경하지 않는다. 대상 컨테이너는 `aiqa`로 고정하며 재연결할 때 내부 IP를 다시 조회한다. 에이전트 종료 시 터널도 종료한다. SSH가 끊기면 재시도하며 자동으로 보안 설정을 완화하지 않는다. 설정이 없으면 기존 WSS 경로를 사용하므로 SSH는 일반 설치의 필수 조건이 아니다.

2026-10-09 연결 Mac은 기존 `heimdall-host` SSH 별칭을 사용해 직접 중계한다. 공개 WSS 경로만 쓸 때 관측된 추가 왕복 지연을 제거하기 위한 운영 설정이다. 이 결과를 다른 네트워크·실물 iPhone 성능으로 일반화하지 않는다.
