package com.aidemo.golmok

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * 동네 중고거래 앱의 결을 그대로 따라간다 — 주황 한 색, 흰 바탕, 굵은 제목.
 *
 * **다크 테마를 만들지 않는다.** 이 앱은 우리 에뮬레이터 한 대에서만 돌고, 그 기기는
 * 늘 라이트다. 두 벌을 만들면 Maestro 시나리오가 어느 색을 볼지 모르는 자리만 는다.
 */
val Brand = Color(0xFFFF6F3C)
val BrandDim = Color(0xFFFFE9E0)
val Ink = Color(0xFF1B1B1B)
val Sub = Color(0xFF8A8A8E)
val Line = Color(0xFFEFEFEF)
val Canvas = Color(0xFFFFFFFF)

private val scheme = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = BrandDim,
    onPrimaryContainer = Brand,
    background = Canvas,
    onBackground = Ink,
    surface = Canvas,
    onSurface = Ink,
    surfaceVariant = Color(0xFFF7F7F8),
    onSurfaceVariant = Sub,
    outline = Line,
)

private val typo = Typography(
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp),
    bodyMedium = TextStyle(fontSize = 13.sp),
    labelSmall = TextStyle(fontSize = 11.sp),
)

@Composable
fun GolmokTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = typo, content = content)
}
