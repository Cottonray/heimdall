// 샘플 앱 "골목" — AI QA 데모의 **테스트 대상**이다. 스토어에 올라가지 않는다.
//
// 저장소의 다른 앱(frontend/<svc>/app)과 달리 React Native 가 아니라 **네이티브 Kotlin**
// 이다. 이유는 하나 — 이 앱은 데모 이미지 안에서 gradle 로 한 번 구워져 에뮬레이터에
// 그대로 설치돼야 하고, Metro·Node 툴체인을 그 이미지에 같이 넣을 이유가 없다.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "golmok"

// :app 이 테스트 대상, :ime 는 그 대상을 조작하기 위한 도구다 (한글 입력).
// 둘을 갈라 둔 이유는 ime/build.gradle.kts 첫 주석에 있다
include(":app", ":ime")
