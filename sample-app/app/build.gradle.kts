plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.example.demo.golmok"
    compileSdk = 35

    defaultConfig {
        // **`com.example.app.*` 가 아니다.** 그 네임스페이스는 스토어에 올라가는 앱의
        // 것이고(docs/rules.md §앱 식별자), 이 앱은 데모 에뮬레이터 안에서만 산다.
        // `demo` 를 끼워 두면 스토어 콘솔 목록에서도 한눈에 갈린다.
        applicationId = "com.example.demo.golmok"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        // **디버그로만 굽는다.** 서명 키가 필요 없고(디버그 키는 SDK 가 만든다), 이 앱이
        // 갈 곳은 우리 에뮬레이터 하나뿐이다. 난독화도 켜지 않는다 — Maestro 가 보는
        // 리소스 아이디가 그대로 남아 있어야 한다.
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

    buildFeatures {
        compose = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    // BOM 이 Compose 라이브러리들의 번호를 한 줄로 묶는다. 개별 버전을 적지 않는다 —
    // 서로 안 맞는 조합을 손으로 고르는 것이 여기서 가장 잘 깨지는 자리다
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    // 아이콘은 **core 에 있는 것만** 쓴다. material-icons-extended 는 천 개가 넘는 벡터를
    // 통째로 들여와서, 난독화를 끈 이 디버그 apk 에서는 그게 그대로 설치 시간이 된다
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
}
