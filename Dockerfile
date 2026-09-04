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

# Appium(UiAutomator2). **세 번째 갈래다.**
#
# npm 패키지를 우리 서버에 들이는 것이 아니다 — Appium 은 이 이미지 안에서 도는 별개의
# 서버이고, 우리 서버는 거기에 HTTP(W3C WebDriver)로 말한다(server/src/appium.ts).
# 그래서 `node_modules` 0 이라는 전제는 그대로다.
#
# 드라이버는 **사용자 홈(~/.appium)에 깔린다.** 그래서 appium 자체는 root 로 전역 설치하고
# 드라이버는 아래에서 aiqa 로 깐다 — 순서를 바꾸면 서버가 드라이버를 못 찾는다.
ARG APPIUM_VERSION=2.19.0
ARG UIA2_VERSION=4.2.3
RUN npm install -g "appium@${APPIUM_VERSION}"

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

# UiAutomator2 드라이버 — aiqa 홈에 깔린다(위 주석 참고)
RUN appium driver install --source=npm "appium-uiautomator2-driver@${UIA2_VERSION}"

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
# **이 스택의 유일한 npm 의존성: exceljs.**
# 증적 파일에 스크린샷을 셀 안에 박아야 하는데, 그 관계·드로잉 XML 을 손으로 만드는 일이
# 이 데모 전체보다 커진다 (server/package.json 의 설명 참고).
#
# `/opt/aiqa` 에 깐다 — `server/` 는 읽기 전용으로 마운트되므로 그 아래에 깔면 마운트가
# 덮어 가린다. Node 는 상위 node_modules 까지 훑으므로 한 칸 위가 안전하다.
COPY --chown=aiqa:aiqa server/package.json /opt/aiqa/package.json
RUN cd /opt/aiqa && npm install --omit=dev --no-audit --no-fund && chown -R aiqa:aiqa /opt/aiqa/node_modules

# 카메라에 물릴 견본 이미지 (신분증 촬영 화면을 자동으로 돌리기 위한 것 — docs/aiqa.md)
COPY --chown=aiqa:aiqa assets/id-sample.png /opt/aiqa/id-sample.png

# **움직이는 화면도 하나 만들어 둔다.** 얼굴 인증처럼 "가만히 있으면 안 되는" 화면은
# 정지 이미지로는 통과하지 못한다 — 에뮬레이터의 `videofile:` 자리에 넣을 것이다.
#
# 저장소에 mp4 를 커밋하지 않고 **여기서 굽는다.** 이미 있는 ffmpeg 로 견본 이미지에서
# 만들면 되고, 그러면 무엇이 들어 있는 영상인지가 이 다섯 줄로 설명된다.
#   · 6초 · 640x480 · 15fps (에뮬레이터가 되돌려 재생한다)
#   · **화면 한가운데** 빨간 막대가 좌우로 오가고, 배경도 같이 흐른다 — **화면이 정말
#     움직이는지**를 눈으로 확인하는 자리다. 정지 이미지를 물려 놓고 "영상이 들어갔다"고
#     착각하는 것을 막는 유일한 표시다.
#     **가장자리에 두지 않는다** — 세로 화면의 카메라 미리보기는 640x480 의 좌우(세로로 보면
#     위아래)를 잘라 내므로, 아래쪽 막대는 잘려서 안 보인다. 실제로 그렇게 한 번 헤맸다
RUN set -eux; \
    ffmpeg -hide_banner -loglevel error -loop 1 -i /opt/aiqa/id-sample.png -t 6 -r 15 \
      -vf "scale=900:-2,crop=640:480:x=(in_w-640)/2+140*sin(t*1.6):y=(in_h-480)/2,drawbox=x=(iw-170)*abs(sin(t*0.9)):y=ih/2-35:w=170:h=70:color=red@0.9:t=fill" \
      -c:v libx264 -preset veryfast -pix_fmt yuv420p -an /opt/aiqa/id-sample.mp4; \
    chown aiqa:aiqa /opt/aiqa/id-sample.mp4; \
    ls -l /opt/aiqa/id-sample.mp4
COPY --chown=aiqa:aiqa entrypoint.sh /opt/aiqa/entrypoint.sh
USER root
RUN chmod +x /opt/aiqa/entrypoint.sh
# 증적이 쌓이는 자리. **이미지 안에 미리 만들어 둔다** — 도커는 이름 있는 볼륨을 처음
# 붙일 때 그 자리의 내용과 **소유자를 그대로 복사**한다. 없으면 root 소유로 생기고,
# 이 컨테이너는 aiqa 로 도니까 증적을 한 건도 못 쓴다(EACCES, 2026-09-04 에 밟았다).
RUN mkdir -p /opt/aiqa/runs && chown aiqa:aiqa /opt/aiqa/runs
USER aiqa

WORKDIR /opt/aiqa
EXPOSE 8080
ENTRYPOINT ["/opt/aiqa/entrypoint.sh"]
