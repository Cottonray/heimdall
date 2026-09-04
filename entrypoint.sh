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
APP_ID=${AIQA_APP_ID:-com.example.demo.golmok}

# ── 에뮬레이터 ────────────────────────────────────────────────────────────────
# -no-window       : 화면이 없다. 우리는 screencap 으로 가져간다
# -gpu swiftshader_indirect : 소프트웨어 렌더. 홈서버에 GPU 가 없다
# -no-snapshot     : 늘 찬 부팅. 스냅샷은 빠르지만 어긋난 상태로 되살아나는 판이 있고,
#                    데모에서 그건 "어제 누가 눌러 둔 화면"으로 나타난다
# -accel on        : KVM 없으면 여기서 바로 죽는다. 조용히 느려지는 것보다 낫다
start_emulator() {
    log "에뮬레이터 기동 ($AVD)"
    emulator -avd "$AVD" \
        -no-window -no-audio -no-boot-anim -no-snapshot \
        -gpu swiftshader_indirect -accel on \
        -memory 2048 -cores 4 \
        -camera-back none -camera-front none \
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
    # 잠금화면을 걷어낸다. 데모를 여는 사람이 매번 쓸어 올릴 이유가 없다
    adb -s "$SERIAL" shell locksettings set-disabled true >/dev/null 2>&1 || true
    adb -s "$SERIAL" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
    adb -s "$SERIAL" shell wm dismiss-keyguard >/dev/null 2>&1 || true
}

install_app() {
    if [ ! -f "$APK" ]; then
        log "!! 샘플 앱 apk 가 없어요: $APK"
        return 1
    fi
    log "샘플 앱 설치"
    # -r 재설치 · -g 런타임 권한 미리 허용(이 앱은 권한을 안 쓰지만 습관을 맞춘다)
    adb -s "$SERIAL" install -r -g "$APK" || return 1
    adb -s "$SERIAL" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    log "샘플 앱 실행 ($APP_ID)"
}

# ── 감시 고리 ────────────────────────────────────────────────────────────────
# 에뮬레이터가 죽으면 다시 띄운다. **서버는 죽이지 않는다** — 그 사이 화면은
# "기기가 아직 안 떴어요"를 보여 주고, 기기가 돌아오면 프레임이 다시 흐른다.
supervise() {
    while true; do
        if ! kill -0 "$EMU_PID" 2>/dev/null; then
            log "!! 에뮬레이터가 내려갔어요. 다시 띄웁니다"
            adb kill-server >/dev/null 2>&1 || true
            start_emulator
            if wait_for_boot; then
                prepare_device
                install_app
            fi
        fi
        sleep 15
    done
}

start_emulator
if wait_for_boot; then
    prepare_device
    install_app
else
    log "기기 없이 서버만 띄웁니다 — 화면이 그 사실을 알려 줍니다"
fi

supervise &

log "서버 기동"
exec node --experimental-strip-types /opt/aiqa/server/src/main.ts
