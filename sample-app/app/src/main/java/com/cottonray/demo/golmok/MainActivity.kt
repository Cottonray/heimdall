package com.example.demo.golmok

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import kotlinx.coroutines.launch

/**
 * 화면 하나. **네비게이션 라이브러리를 쓰지 않는다** — 화면이 여섯이고 되돌아갈 길이
 * 하나뿐이라, 스택 하나로 충분하다. 의존성이 적을수록 이미지 안 gradle 빌드가 짧다.
 */
sealed interface Route {
    data object Tabs : Route
    data object Search : Route
    data class Detail(val itemId: Int) : Route
    data class Chat(val peer: String, val itemTitle: String) : Route
    data object Sell : Route
}

class MainActivity : ComponentActivity() {

    @OptIn(ExperimentalComposeUiApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Copy.load(this)

        setContent {
            GolmokTheme {
                val snackbar = remember { SnackbarHostState() }
                val scope = rememberCoroutineScope()

                // 돌아갈 길. 뒤로 버튼도 Maestro 의 `back` 도 이 스택을 본다
                val stack = remember { mutableStateListOf<Route>(Route.Tabs) }
                var tab by remember { mutableIntStateOf(0) }
                // 등록한 물건은 목록 맨 위에 붙는다. 앱을 다시 띄우면 사라진다 —
                // 저장하지 않는 것이 시나리오를 반복해서 돌리기에 낫다
                val added = remember { mutableStateListOf<Copy.Item>() }
                var liked by remember { mutableStateOf(setOf<Int>()) }

                val route = stack.last()
                BackHandler(enabled = stack.size > 1) { stack.removeAt(stack.lastIndex) }

                Scaffold(
                    // Maestro 가 `id:` 로 요소를 찾을 수 있게 testTag 를 리소스 아이디로
                    // 내보낸다. 글자로만 찾으면 문구를 고칠 때마다 시나리오가 같이 깨진다
                    modifier = Modifier.semantics { testTagsAsResourceId = true }.testTag("golmok_root"),
                    snackbarHost = { SnackbarHost(snackbar) },
                ) { pad ->
                    val inner = Modifier.padding(pad)
                    when (route) {
                        is Route.Tabs -> TabsScreen(
                            modifier = inner,
                            tab = tab,
                            onTab = { tab = it },
                            items = added + Copy.items,
                            liked = liked,
                            onOpenItem = { stack.add(Route.Detail(it)) },
                            onSearch = { stack.add(Route.Search) },
                            onSell = { stack.add(Route.Sell) },
                            onOpenChat = { peer, title -> stack.add(Route.Chat(peer, title)) },
                        )

                        is Route.Search -> SearchScreen(
                            modifier = inner,
                            items = added + Copy.items,
                            onBack = { stack.removeAt(stack.lastIndex) },
                            onOpenItem = { stack.add(Route.Detail(it)) },
                        )

                        is Route.Detail -> {
                            val all = added + Copy.items
                            val item = all.firstOrNull { it.id == route.itemId } ?: all.first()
                            DetailScreen(
                                modifier = inner,
                                item = item,
                                others = all.filter { it.sellerNick == item.sellerNick && it.id != item.id },
                                liked = liked.contains(item.id),
                                onToggleLike = {
                                    liked = if (liked.contains(item.id)) liked - item.id else liked + item.id
                                },
                                onBack = { stack.removeAt(stack.lastIndex) },
                                onChat = { stack.add(Route.Chat(item.sellerNick, item.title)) },
                            )
                        }

                        is Route.Chat -> ChatScreen(
                            modifier = inner,
                            peer = route.peer,
                            itemTitle = route.itemTitle,
                            onBack = { stack.removeAt(stack.lastIndex) },
                        )

                        is Route.Sell -> SellScreen(
                            modifier = inner,
                            onBack = { stack.removeAt(stack.lastIndex) },
                            onSubmit = { title, price, desc ->
                                // 새 물건은 기존 것과 겹치지 않는 번호를 받는다
                                val id = 1000 + added.size
                                added.add(
                                    0,
                                    Copy.Item(
                                        id = id,
                                        title = title,
                                        town = Copy.home.town,
                                        ago = "방금 전",
                                        price = price,
                                        desc = desc,
                                        likes = 0,
                                        chatCount = 0,
                                        sellerNick = Copy.profile.nick,
                                        sellerTemp = "36.5",
                                        category = "기타",
                                        badge = "",
                                    ),
                                )
                                stack.removeAt(stack.lastIndex)
                                tab = 0
                                scope.launch { snackbar.showSnackbar(Copy.sell.doneToast) }
                            },
                        )
                    }
                }
            }
        }
    }
}
