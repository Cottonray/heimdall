# AI QA 데모 — **한 컨테이너 안에 에뮬레이터·Maestro·서버가 같이 있다.**
#
# 나누고 싶은 마음이 먼저 들지만, 나누면 adb 가 컨테이너 경계를 넘어야 한다. Maestro 는
# 기기를 자기 방식으로 찾고(dadb), 그 경로를 네트워크로 돌리는 순간 "왜 기기를 못 찾나"가
# 데모에서 제일 자주 깨지는 자리가 된다. 한 상자에 두면 adb 도 Maestro 도 로컬이다.
#
# 대신 **자주 바뀌는 것은 굽지 않는다** — 서버 소스(server/)·화면(web/)·시나리오(flows/)는
# 마운트한다. 그래서 문구 하나 고치자고 이 3GB 짜리 이미지를 다시 만들 일이 없다
# (AICC 가 web/ 을 마운트하는 것과 같은 판단).
#
# 빌드 컨텍스트는 deploy/aiqa 다.

# ── 공통 바탕: Node + JDK + Android 명령줄 도구 ────────────────────────────────
FROM node:24-bookworm AS sdk

ENV ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_HOME=/opt/android-sdk \
    DEBIAN_FRONTEND=noninteractive \
    # **로케일을 UTF-8 로 못박는다.** 없으면 JVM 이 콘솔 인코딩을 ASCII 로 잡고,
    # Maestro 가 찍는 한글이 전부 `?` 가 된다("Tap on \"?? ??? ???\"").
    # 화면 로그가 곧 이 데모의 절반이라 그게 그대로 깨져 보인다 — 실제로 밟았다.
    #
    # 이 블록을 고치면 **이미지 전체가 다시 구워진다** (SDK·시스템 이미지 3GB 재다운로드,
    # 25분). 아래 두 단계가 전부 이 레이어 위에 얹혀 있어서다. 값을 바꿀 일이 생기면
    # 그 사실을 알고 시작할 것 — 여기서 한 번 그렇게 25분을 썼다.
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        openjdk-17-jdk-headless unzip curl ca-certificates; \
    rm -rf /var/lib/apt/lists/*

# **버전을 못박아 둔다.** `latest` 로 두면 이미지를 다시 굽는 날 도구가 조용히 올라가고,
# 그걸 아는 자리는 에뮬레이터가 안 뜨는 순간뿐이다 (홈 Jenkins Dockerfile 과 같은 이유).
ARG CMDLINE_TOOLS=11076708
RUN set -eux; \
    mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"; \
    curl -fsSL -o /tmp/tools.zip \
        "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip"; \
    unzip -q /tmp/tools.zip -d /tmp/cmdline; \
    mv /tmp/cmdline/cmdline-tools "$ANDROID_SDK_ROOT/cmdline-tools/latest"; \
    rm -rf /tmp/tools.zip /tmp/cmdline

ENV PATH="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$PATH"

# 라이선스 동의는 파일 몇 줄이다. 대화형으로 두면 빌드가 거기서 멈춘다
RUN yes | sdkmanager --licenses >/dev/null

# ── 샘플 앱 굽기 ──────────────────────────────────────────────────────────────
# 별도 단계인 이유: gradle 캐시와 build-tools 는 **실행 이미지에 남을 이유가 없다**.
# 나오는 것은 apk 한 장뿐이다.
FROM sdk AS apk

ARG GRADLE_VERSION=8.11.1
RUN set -eux; \
    sdkmanager "platforms;android-35" "build-tools;35.0.0" >/dev/null; \
    curl -fsSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"; \
    unzip -q /tmp/gradle.zip -d /opt; \
    rm /tmp/gradle.zip
ENV PATH="/opt/gradle-${GRADLE_VERSION}/bin:$PATH"

WORKDIR /src
COPY sample-app/ /src/
# --offline 이 아니다 — 첫 빌드는 의존성을 받아야 한다. 그 대신 이 레이어는 sample-app 이
# 바뀔 때만 다시 돈다
RUN gradle --no-daemon --console=plain assembleDebug

# ── 실행 이미지 ───────────────────────────────────────────────────────────────
FROM sdk AS runtime

# ffmpeg: 화면 한 장(PNG)을 줄여 JPEG 으로 바꾸는 데 쓴다 (server/src/device.ts).
#         이게 없으면 프레임이 열 배로 커져 집 업로드 회선이 먼저 무너진다.
# 나머지: 에뮬레이터가 창 없이 뜰 때도 필요한 X·GL·오디오 라이브러리들.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ffmpeg socat procps \
        libpulse0 libnss3 libxcursor1 libxdamage1 libxrandr2 libxi6 libxtst6 \
        libgl1 libglu1-mesa libx11-6 libxcomposite1 libxext6 libxfixes3 libasound2; \
    rm -rf /var/lib/apt/lists/*

# API 34 · google_apis · x86_64. google_apis 를 고른 것은 `adb root` 가 되기 때문이고
# (playstore 이미지는 안 된다), Play 스토어는 필요 없다 — 앱은 우리가 직접 설치한다.
ARG API_LEVEL=34
ARG SYSTEM_IMAGE="system-images;android-34;google_apis;x86_64"
RUN set -eux; \
    sdkmanager "platform-tools" "emulator" "platforms;android-${API_LEVEL}" "${SYSTEM_IMAGE}" >/dev/null

# **에뮬레이터를 root 로 띄우지 않는다.** 이 컨테이너는 /dev/kvm 을 들고 있어서, 안에서의
# 임의 실행이 곧 호스트 가상화 장치 접근이다. kvm 그룹(호스트 gid 992)에만 넣어 준다.
ARG KVM_GID=992
RUN set -eux; \
    groupadd -g "$KVM_GID" kvm2 || true; \
    useradd -m -u 1001 -s /bin/bash aiqa; \
    usermod -aG "$KVM_GID" aiqa; \
    mkdir -p /opt/aiqa; \
    chown -R aiqa:aiqa /opt/aiqa

# Maestro. 설치 스크립트가 최신을 받아 ~/.maestro 에 푼다.
# **번호를 고정하려면 MAESTRO_VERSION 을 넘긴다** — 지금은 비워 둔다. 이 데모가 쓰는 명령은
# tapOn/inputText/assertVisible 몇 개뿐이라 판번호에 민감하지 않고, 고정해 둔 번호가
# 어느 날 내려가면 이미지 자체가 안 구워진다.
ARG MAESTRO_VERSION=""
USER aiqa
RUN set -eux; \
    if [ -n "$MAESTRO_VERSION" ]; then export MAESTRO_VERSION; fi; \
    curl -fsSL "https://get.maestro.mobile.dev" | bash
ENV PATH="/home/aiqa/.maestro/bin:$PATH"

# AVD 한 대. **늘리지 않는다** — 이 데모의 전제다 (docs/aiqa.md §한 대만 띄운다).
#
# 해상도를 720x1600·320dpi 로 낮춰 잡는다. Pixel 기본값(1080x2340)이면 screencap 한 장이
# 세 배 무겁고, 그게 그대로 조작 지연이 된다. 320dpi 라 화면 자체는 평범한 폰과 같다.
RUN set -eux; \
    echo no | avdmanager create avd -n aiqa -k "system-images;android-34;google_apis;x86_64" -d pixel_5 --force; \
    cfg="$HOME/.android/avd/aiqa.avd/config.ini"; \
    sed -i '/^hw\.lcd\./d; /^hw\.ramSize/d; /^hw\.keyboard/d; /^disk\.dataPartition\.size/d' "$cfg"; \
    { \
      echo 'hw.lcd.width=720'; \
      echo 'hw.lcd.height=1600'; \
      echo 'hw.lcd.density=320'; \
      echo 'hw.ramSize=2048'; \
      echo 'hw.keyboard=yes'; \
      echo 'disk.dataPartition.size=4096'; \
    } >> "$cfg"

COPY --from=apk --chown=aiqa:aiqa /src/app/build/outputs/apk/debug/app-debug.apk /opt/aiqa/golmok.apk
# 한글을 넣어 주는 QA 전용 키보드. 테스트 대상이 아니라 도구라 apk 가 따로다
# (`adb shell input text` 는 아스키만 넣는다 — sample-app/ime/build.gradle.kts 참고)
COPY --from=apk --chown=aiqa:aiqa /src/ime/build/outputs/apk/debug/ime-debug.apk /opt/aiqa/qaime.apk
COPY --chown=aiqa:aiqa entrypoint.sh /opt/aiqa/entrypoint.sh
USER root
RUN chmod +x /opt/aiqa/entrypoint.sh
USER aiqa

WORKDIR /opt/aiqa
EXPOSE 8080
ENTRYPOINT ["/opt/aiqa/entrypoint.sh"]
