// **버전을 못박아 둔다.** 이 앱은 데모 이미지 안에서 한 번 구워지고 그대로 쓰인다 —
// 어느 날 플러그인이 조용히 올라가 빌드가 깨지면, 깨진 것을 아는 자리가 에뮬레이터가
// 안 뜨는 순간뿐이다.
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    // Kotlin 2.x 부터 Compose 컴파일러는 코틀린과 같은 번호로 따라간다. 둘을 어긋나게 두면
    // "This version of the Compose Compiler requires Kotlin version …" 로 떨어진다
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
}
