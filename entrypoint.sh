#!/usr/bin/env bash
# 컨테이너가 뜨면 하는 일 — 에뮬레이터 한 대를 띄우고, 샘플 앱을 얹고, 서버를 켠다.
#
# **에뮬레이터는 서버보다 먼저 뜨고 서버보다 오래 산다.** 서버가 죽어도(코드 오류) 기기는
# 그대로 두고 싶지만 한 컨테이너라 같이 죽는다 — 대신 서버는 마운트된 소스를 읽으므로
# 다시 띄우는 데 이미지 빌드가 끼지 않는다. 기기가 죽으면 아래 감시 고리가 다시 띄운다.
set -uo pipefail

log() { printf '[aiqa %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

AVD=${AIQA_AVD:-aiqa}
SERIAL=${AIQA_SERIAL:-emulator-5554}
APK=${AIQA_APK:-/opt/aiqa/golmok.apk}
APP_ID=${AIQA_APP_ID:-com.aidemo.golmok}
# 한글을 넣어 주는 QA 전용 키보드 (sample-app/ime/). 테스트 대상이 아니라 도구다
IME_APK=${AIQA_IME_APK:-/opt/aiqa/qaime.apk}
IME_ID=${AIQA_IME_ID:-com.aidemo.qaime/.QaKeyboard}

# **카메라에 무엇을 물릴까.** 렌즈 앞에 종이를 들고 있을 사람이 없으니 에뮬레이터에게
# 파일을 준다. 카메라를 여는 앱은 그걸 "지금 렌즈에 보이는 것"으로 받는다.
#
#   image  정지 이미지 — 신분증·카드·QR 촬영 (기본값)
#   video  동영상      — 얼굴 인증처럼 가만히 있으면 안 되는 화면
#   none   끔
#
# 더 특이한 것(`webcam0`·`image360:`)이 필요하면 AIQA_CAMERA_BACK 에 그대로 적는다 —
# 그 값이 아래 판단을 통째로 이긴다.
CAMERA_SOURCE=${AIQA_CAMERA_SOURCE:-image}
ID_IMAGE=${AIQA_CAMERA_IMAGE:-/opt/aiqa/id-sample.png}
ID_VIDEO=${AIQA_CAMERA_VIDEO:-/opt/aiqa/id-sample.mp4}

pick_camera() {
    case "$CAMERA_SOURCE" in
        video)
            [ -f "$ID_VIDEO" ] && { echo "videofile:$ID_VIDEO"; return; }
            log "!! 영상이 없어요($ID_VIDEO) — 이미지로 갑니다"
            ;;
        none) echo none; return ;;
    esac
    [ -f "$ID_IMAGE" ] && { echo "imagefile:$ID_IMAGE"; return; }
    echo none
}
CAMERA_BACK=${AIQA_CAMERA_BACK:-$(pick_camera)}

# ── 에뮬레이터 ────────────────────────────────────────────────────────────────
# -no-window       : 화면이 없다. 우리는 screencap 으로 가져간다
# -gpu swiftshader_indirect : 소프트웨어 렌더. 홈서버에 GPU 가 없다
# -no-snapshot     : 늘 찬 부팅. 스냅샷은 빠르지만 어긋난 상태로 되살아나는 판이 있고,
#                    데모에서 그건 "어제 누가 눌러 둔 화면"으로 나타난다
# -accel on        : KVM 없으면 여기서 바로 죽는다. 조용히 느려지는 것보다 낫다
start_emulator() {
    # **지난번에 남긴 자물쇠를 먼저 치운다.** 컨테이너가 갑자기 죽으면(배포로 갈아끼울
    # 때가 그렇다) 에뮬레이터가 `*.lock` 을 정리하지 못하고 사라진다. 그 상태로 다시
    # 띄우면 남의 것으로 오해해서 이렇게 죽는다:
    #   FATAL | Running multiple emulators with the same AVD is an experimental feature.
    # AVD 는 볼륨에 있어 컨테이너를 새로 만들어도 그 자물쇠가 따라온다 — 실제로 밟았다.
    # **정말로 두 대가 뜰 일은 없다** (한 컨테이너에 한 대다).
    rm -rf "$HOME/.android/avd/$AVD.avd"/*.lock 2>/dev/null || true

    log "에뮬레이터 기동 ($AVD) · 카메라 $CAMERA_BACK"
    emulator -avd "$AVD" \
        -no-window -no-audio -no-boot-anim -no-snapshot \
        -gpu swiftshader_indirect -accel on \
        -memory 2048 -cores 4 \
        -camera-back "$CAMERA_BACK" -camera-front none \
        -netdelay none -netspeed full \
        >/tmp/emulator.log 2>&1 &
    EMU_PID=$!
}

wait_for_boot() {
    log "부팅 대기"
    adb start-server >/dev/null 2>&1
    for _ in $(seq 1 180); do
        state=$(adb -s "$SERIAL" get-state 2>/dev/null || true)
        if [ "$state" = "device" ]; then
            booted=$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n ')
            [ "$booted" = "1" ] && { log "부팅 완료"; return 0; }
        fi
        sleep 2
    done
    log "!! 6분 안에 부팅되지 않았어요 — /tmp/emulator.log"
    tail -40 /tmp/emulator.log
    return 1
}

prepare_device() {
    # **애니메이션을 끈다.** 켜 두면 Maestro 도 adb 갈래도 화면이 멈추기를 기다리느라
    # 매 단계 수백 ms 씩 더 쓴다 — 두 갈래를 견주는 자리라 그 잡음을 없애 둔다.
    adb -s "$SERIAL" shell settings put global window_animation_scale 0
    adb -s "$SERIAL" shell settings put global transition_animation_scale 0
    adb -s "$SERIAL" shell settings put global animator_duration_scale 0
    # 화면이 꺼지면 screencap 이 검은 장면만 준다. 늘 켜 둔다
    adb -s "$SERIAL" shell settings put system screen_off_timeout 2147483647
    adb -s "$SERIAL" shell svc power stayon true >/dev/null 2>&1 || true
    # **웹뷰 안을 보이게 한다.** 이게 없으면 웹 화면이 접근성 트리에 `android.webkit.WebView`
    # 빈 상자 하나로만 올라온다 — 눈에는 페이지가 멀쩡히 보이는데 어떤 도구도 그 안의
    # 글자를 못 집는다(세 갈래 전부). Chromium 은 화면낭독기 같은 클라이언트를 감지해야
    # 접근성 트리를 만드는데, uiautomator 는 그 조건을 만족시키지 못한다.
    #
    # 이 플래그 파일은 **디버그 빌드 앱에만** 먹는다. 그래서 진짜 서비스를 테스트할 때는
    # 앱을 디버그로 받아 오거나, Appium 의 웹뷰 컨텍스트 전환을 써야 한다 (docs/aiqa.md).
    adb -s "$SERIAL" shell 'echo "_ --force-renderer-accessibility" > /data/local/tmp/webview-command-line'
    # 잠금화면을 걷어낸다. 데모를 여는 사람이 매번 쓸어 올릴 이유가 없다
    adb -s "$SERIAL" shell locksettings set-disabled true >/dev/null 2>&1 || true
    adb -s "$SERIAL" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
    adb -s "$SERIAL" shell wm dismiss-keyguard >/dev/null 2>&1 || true
}

# apk 하나를 얹는다. **서명이 다르면 지우고 다시 넣는다.**
#
# 이미지를 다시 구우면 gradle 이 디버그 서명 키를 새로 만든다. 그러면 기기에 이미 깔린
# 같은 패키지와 서명이 어긋나서 재설치가 이렇게 막힌다:
#   INSTALL_FAILED_UPDATE_INCOMPATIBLE: ... signatures do not match newer version
# 그런데 `adb install` 은 그래도 **0으로 끝난다** — 조용히 옛 버전이 남는다. 실제로
# 결과 코드를 새로 넣은 키보드가 안 올라가서 한글 입력이 계속 샜다.
install_apk() {
    apk=$1
    pkg=$2
    out=$(adb -s "$SERIAL" install -r -g "$apk" 2>&1)
    case "$out" in
        *Success*) return 0 ;;
    esac
    case "$out" in
        *INSTALL_FAILED_UPDATE_INCOMPATIBLE* | *INSTALL_FAILED_VERSION_DOWNGRADE*)
            log "  서명이 달라 지우고 다시 넣습니다 ($pkg)"
            adb -s "$SERIAL" uninstall "$pkg" >/dev/null 2>&1
            out=$(adb -s "$SERIAL" install -r -g "$apk" 2>&1)
            ;;
    esac
    case "$out" in
        *Success*) return 0 ;;
        *) log "  !! 설치 실패 ($pkg): $out"; return 1 ;;
    esac
}

install_ime() {
    # **한글 때문에 있다.** `adb shell input text` 는 아스키만 넣고 한글은 조용히
    # 사라진다 — adb 갈래로 "자전거"를 검색하려면 글자를 넣어 줄 자리가 필요하다.
    # 기본 키보드로 세워 두면 자판이 화면을 가리지도 않는다(1px 짜리다).
    [ -f "$IME_APK" ] || { log "!! QA 키보드 apk 가 없어요: $IME_APK"; return 0; }
    log "QA 키보드 설치"
    install_apk "$IME_APK" "com.aidemo.qaime" || return 0

    # **한 번 세우고 마는 것으로는 안 된다.** 방금 깔린 패키지를 시스템의 IME 관리자가
    # 아직 훑기 전이면 `ime set` 이 성공했다고 말해 놓고 곧 되돌아간다 — 실제로 로그에는
    # "기본 키보드: …qaime" 라고 찍혔는데 정작 입력칸에 붙은 것은 Gboard 였고, 한글이
    # 전부 빈칸으로 들어갔다. 그래서 **목록에 들었고 기본값이 우리 것인지**를 보고 다시 건다.
    for _ in $(seq 1 10); do
        adb -s "$SERIAL" shell ime enable "$IME_ID" >/dev/null 2>&1
        adb -s "$SERIAL" shell ime set "$IME_ID" >/dev/null 2>&1
        sleep 1
        enabled=$(adb -s "$SERIAL" shell settings get secure enabled_input_methods 2>/dev/null | tr -d "\r")
        current=$(adb -s "$SERIAL" shell settings get secure default_input_method 2>/dev/null | tr -d "\r")
        case "$enabled" in *"$IME_ID"*) ;; *) continue ;; esac
        if [ "$current" = "$IME_ID" ]; then
            log "기본 키보드: $current"
            return 0
        fi
    done
    log "!! QA 키보드를 기본으로 세우지 못했어요 — 한글 입력이 빈칸으로 들어갑니다"
}

# **옛 이름으로 깔려 있던 것을 지운다.** 샘플 앱·QA 키보드는 처음에 회사 네임스페이스
# (`com.example.demo.*`)로 지었다가 2026-09-04 에 `com.aidemo.*` 로 갈아엎었다. 그런데
# AVD 는 볼륨(`aiqa-avd`)에 있어 **컨테이너를 새로 만들어도 설치된 앱이 따라온다** — 이미지를
# 다시 구워 배포한 직후에도 옛 패키지 둘이 그대로 남아 있었다. 남아 있으면 앱 서랍과 키보드
# 목록에 같은 앱이 두 개씩 보이고, 그 이름이 사명을 그대로 드러낸다
# (docs/rules.md §데모 사이트에는 `example` 라는 낱말을 쓰지 않는다).
# 이미 없으면 uninstall 이 조용히 실패할 뿐이라 그냥 매번 건다.
drop_legacy_packages() {
    for pkg in com.example.demo.golmok com.example.demo.qaime; do
        case "$(adb -s "$SERIAL" shell pm list packages "$pkg" 2>/dev/null | tr -d '\r')" in
            *"$pkg"*)
                log "옛 이름 패키지 제거 ($pkg)"
                adb -s "$SERIAL" uninstall "$pkg" >/dev/null 2>&1
                ;;
        esac
    done
}

install_app() {
    if [ ! -f "$APK" ]; then
        log "!! 샘플 앱 apk 가 없어요: $APK"
        return 1
    fi
    log "샘플 앱 설치"
    install_apk "$APK" "$APP_ID" || return 1
    adb -s "$SERIAL" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    log "샘플 앱 실행 ($APP_ID)"
}

# ── 감시 고리 ────────────────────────────────────────────────────────────────
# 에뮬레이터가 죽으면 다시 띄운다. **서버는 죽이지 않는다** — 그 사이 화면은
# "기기가 아직 안 떴어요"를 보여 주고, 기기가 돌아오면 프레임이 다시 흐른다.
supervise() {
    while true; do
        # Appium 이 죽어도 다시 띄운다. 나머지 두 갈래는 그동안에도 돈다
        if ! kill -0 "${APPIUM_PID:-0}" 2>/dev/null; then
            log "!! Appium 이 내려갔어요. 다시 띄웁니다"
            start_appium
        fi
        # A zombie still answers kill -0; it has already lost the device.
        if ! kill -0 "$EMU_PID" 2>/dev/null || [ "$(ps -o stat= -p "$EMU_PID" 2>/dev/null | cut -c1)" = Z ]; then
            log "!! 에뮬레이터가 내려갔어요. 다시 띄웁니다"
            adb kill-server >/dev/null 2>&1 || true
            start_emulator
            if wait_for_boot; then
                prepare_device
                drop_legacy_packages
                install_app
                install_ime
            fi
        fi
        sleep 15
    done
}

start_emulator
if wait_for_boot; then
    prepare_device
    drop_legacy_packages
    # **앱을 먼저, 키보드를 나중에.** 앱을 지웠다 다시 깔면 시스템이 IME 목록을 다시
    # 훑으면서 방금 세운 기본 키보드를 되돌리는 판이 있다
    install_app
    install_ime
else
    log "기기 없이 서버만 띄웁니다 — 화면이 그 사실을 알려 줍니다"
fi

# ── Appium ───────────────────────────────────────────────────────────────────
# 세 번째 갈래가 붙는 자리. **밖으로 열지 않는다** — 127.0.0.1 에만 듣는다. 이 서버는
# 붙는 사람에게 기기 전체를 내주므로, 컨테이너 밖에서 닿으면 안 된다.
start_appium() {
    log "Appium 기동"
    appium server --address 127.0.0.1 --port 4723 --log-level error \
        --relaxed-security >/tmp/appium.log 2>&1 &
    APPIUM_PID=$!
    for _ in $(seq 1 40); do
        if wget -qO- http://127.0.0.1:4723/status >/dev/null 2>&1; then
            log "Appium 준비됨"
            return 0
        fi
        sleep 1
    done
    log "!! Appium 이 40초 안에 안 떴어요 — /tmp/appium.log (appium 갈래만 안 돕니다)"
    tail -20 /tmp/appium.log
}

start_appium

supervise &

log "서버 기동"
exec node --experimental-strip-types /opt/aiqa/server/src/main.ts
