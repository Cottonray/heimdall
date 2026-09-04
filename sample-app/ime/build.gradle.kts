// QA 전용 키보드 — **테스트 대상 앱이 아니라 도구다.** 그래서 모듈이 따로다.
//
// 왜 있나: `adb shell input text` 는 **아스키만 넣는다.** 한글은 KeyCharacterMap 에 없어서
// 키 이벤트로 바뀌지 못하고 조용히 사라진다. adb 갈래로 "자전거"를 검색하려면 글자를
// 넣어 줄 자리가 하나 필요하고, 그 자리가 IME 다 (QA 도구들이 흔히 쓰는 방법이다).
//
// **왜 샘플 앱 안이 아닌가**: 시나리오가 `launchApp: clearState` 로 앱 데이터를 지운다.
// 같은 패키지에 있으면 그때 키보드 서비스까지 같이 멈춰 다음 입력이 빈칸으로 들어간다.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.demo.qaime"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.example.demo.qaime"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // 없다. InputMethodService 는 플랫폼에 있다
}
