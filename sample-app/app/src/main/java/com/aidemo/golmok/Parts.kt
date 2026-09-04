package com.aidemo.golmok

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * 여러 화면이 같이 쓰는 조각들. 여기 있는 것만 화면 파일에서 쓴다 —
 * 같은 모양을 두 번 그리면 나중에 한쪽만 바뀐다.
 */

/** 뒤로 가기가 붙은 상단 바. 하위 화면은 전부 이걸 쓴다 */
@Composable
fun TopBar(title: String, onBack: () -> Unit, trailing: @Composable () -> Unit = {}) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack, modifier = Modifier.testTag("back")) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로")
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            trailing()
        }
        HorizontalDivider(color = Line)
    }
}

/**
 * 사진 자리. **진짜 사진을 넣지 않는다** — 네트워크도 안 쓰고 큰 리소스도 안 넣는다
 * (apk 가 커지면 에뮬레이터 설치가 그만큼 느려진다). 제목에서 뽑은 색으로 칠한 상자다.
 */
@Composable
fun Thumb(seed: String, size: Int, corner: Int = 8, fillWidth: Boolean = false) {
    val hue = (seed.sumOf { it.code } % 360).toFloat()
    val a = Color.hsl(hue, 0.42f, 0.86f)
    val b = Color.hsl((hue + 28f) % 360f, 0.5f, 0.74f)
    // 가로를 꽉 채우는 판(상세 화면 큰 사진)은 size 로는 안 된다 — 고정 폭이 먼저 걸린다
    val shape = if (fillWidth) Modifier.fillMaxWidth().height(size.dp) else Modifier.size(size.dp)
    Box(
        modifier = shape
            .clip(RoundedCornerShape(corner.dp))
            .background(Brush.linearGradient(listOf(a, b))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = seed.take(1),
            color = Color.White.copy(alpha = 0.9f),
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleLarge,
        )
    }
}

/** 목록 한 줄 — 홈·검색 결과가 같은 모양을 쓴다 */
@Composable
fun ItemRow(item: Copy.Item, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).testTag("item_${item.id}")) {
        Row(modifier = Modifier.padding(16.dp)) {
            Thumb(item.title, size = 96)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.title, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(2.dp))
                Text("${item.town} · ${item.ago}", style = MaterialTheme.typography.labelSmall, color = Sub)
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (item.badge.isNotEmpty()) {
                        Badge(item.badge)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(
                        formatPrice(item.price),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (item.chatCount > 0) Text("채팅 ${item.chatCount}", style = MaterialTheme.typography.labelSmall, color = Sub)
                    if (item.likes > 0) Text("관심 ${item.likes}", style = MaterialTheme.typography.labelSmall, color = Sub)
                }
            }
        }
        HorizontalDivider(color = Line)
    }
}

/** 예약중·거래완료 같은 작은 딱지 */
@Composable
fun Badge(text: String) {
    val done = text.contains("완료")
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(if (done) Color(0xFFEDEDED) else BrandDim)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            color = if (done) Sub else Brand,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/** 눌러서 고르는 칩 한 개 */
@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (selected) Brand else Color.White)
            .border(1.dp, if (selected) Brand else Line, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .testTag("chip_$text"),
    ) {
        Text(text, style = MaterialTheme.typography.bodyMedium, color = if (selected) Color.White else Ink)
    }
}

/**
 * 온도 막대. 이 앱에서 사람을 믿게 만드는 유일한 장치라 눈에 띄어야 한다 —
 * 숫자만 있으면 아무도 안 본다.
 */
@Composable
fun TempBar(temp: String, label: String) {
    val value = temp.toFloatOrNull() ?: 36.5f
    val ratio = ((value - 30f) / 30f).coerceIn(0.05f, 1f)
    Column(horizontalAlignment = Alignment.End) {
        Text("$value℃ $label", style = MaterialTheme.typography.labelSmall, color = Brand, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .width(72.dp)
                .height(5.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(Color(0xFFEFEFEF)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(ratio)
                    .height(5.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(Brand),
            )
        }
    }
}

/** 목록이 비었을 때 */
@Composable
fun EmptyNote(text: String, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(text, color = Sub, style = MaterialTheme.typography.bodyLarge)
    }
}
