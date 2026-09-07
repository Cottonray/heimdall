package com.aidemo.golmok

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import kotlinx.coroutines.launch

/**
 * 화면 하나. **네비게이션 라이브러리를 쓰지 않는다** — 되돌아갈 길이 하나뿐이라
 * 스택 하나로 충분하다. 의존성이 적을수록 이미지 안 gradle 빌드가 짧다.
 */
sealed interface Route {
    data object Tabs : Route
    data object Search : Route
    data class Detail(val itemId: Int) : Route
    data class Chat(val peer: String, val itemTitle: String) : Route
    data object Sell : Route

    /** **여기서부터 웹이다.** 껍데기만 네이티브이고 안은 웹뷰다 (WebScreen.kt) */
    data object Web : Route

    data object Notifications : Route
    data object TownPicker : Route
    data class Seller(val nick: String) : Route
    data class Post(val postId: Int) : Route
    data object PostWrite : Route
    data class Place(val index: Int) : Route
    data object Sales : Route
    data object Purchases : Route
    data object Likes : Route
    data object Verify : Route
    data object NotifySettings : Route
    data object Categories : Route
    data object Reviews : Route
    data object Support : Route
}

/** 스택을 미는 손잡이. 화면은 이것만 받는다 — 스택을 직접 만지면 뒤로 가기가 두 벌 된다 */
class Nav(private val stack: SnapshotStateList<Route>) {
    fun push(route: Route) {
        stack.add(route)
    }

    fun pop() {
        if (stack.size > 1) stack.removeAt(stack.lastIndex)
    }

    /** 탭 화면까지 통째로 나간다 (등록 완료처럼 결과가 탭에 있을 때) */
    fun popToTabs() {
        while (stack.size > 1) stack.removeAt(stack.lastIndex)
    }
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
                // 앱 안 상태 전부. 앱을 다시 띄우면 처음으로 돌아간다 — 시나리오를 반복해서
                // 돌리기에 그게 낫다 (State.kt)
                val state = remember { AppState(scope) }

                // 돌아갈 길. 뒤로 버튼도 Maestro 의 `back` 도 이 스택을 본다
                val stack = remember { mutableStateListOf<Route>(Route.Tabs) }
                val nav = remember { Nav(stack) }
                var tab by remember { mutableIntStateOf(0) }
                val toast: (String) -> Unit = { msg -> scope.launch { snackbar.showSnackbar(msg) } }

                val route = stack.last()
                BackHandler(enabled = stack.size > 1) { nav.pop() }

                Scaffold(
                    // Maestro 가 `id:` 로 요소를 찾을 수 있게 testTag 를 리소스 아이디로
                    // 내보낸다. 글자로만 찾으면 문구를 고칠 때마다 시나리오가 같이 깨진다
                    modifier = Modifier.semantics { testTagsAsResourceId = true }.testTag("golmok_root"),
                    snackbarHost = { SnackbarHost(snackbar) },
                ) { pad ->
                    val inner = Modifier.padding(pad)
                    when (route) {
                        is Route.Tabs -> TabsScreen(inner, tab, { tab = it }, state, nav)
                        is Route.Search -> SearchScreen(inner, state, nav)
                        is Route.Detail -> DetailScreen(inner, state, route.itemId, nav, toast)
                        is Route.Chat -> ChatScreen(inner, state, route.peer, route.itemTitle, nav)
                        is Route.Sell -> SellScreen(inner, state, nav) {
                            nav.popToTabs()
                            tab = 0
                            toast(Copy.sell.doneToast)
                        }

                        is Route.Web -> WebScreen(
                            modifier = inner,
                            url = EVENT_URL,
                            onBack = { nav.pop() },
                            onCoupon = { state.coupons = it },
                            onEntry = { _, wish ->
                                state.entryWish = wish
                                toast(Copy.event.entryDone)
                            },
                        )

                        is Route.Notifications -> NotificationsScreen(inner, state, nav)
                        is Route.TownPicker -> TownPickerScreen(inner, state, nav, toast)
                        is Route.Seller -> SellerScreen(inner, state, route.nick, nav)
                        is Route.Post -> PostScreen(inner, state, route.postId, nav)
                        is Route.PostWrite -> PostWriteScreen(inner, state, nav) {
                            nav.popToTabs()
                            tab = 1
                            toast(Copy.board.done)
                        }

                        is Route.Place -> PlaceScreen(inner, state, route.index, nav, toast)
                        is Route.Sales -> SalesScreen(inner, state, nav)
                        is Route.Purchases -> PurchasesScreen(inner, nav)
                        is Route.Likes -> LikesScreen(inner, state, nav)
                        is Route.Verify -> VerifyScreen(inner, state, nav)
                        is Route.NotifySettings -> NotifySettingsScreen(inner, state, nav)
                        is Route.Categories -> CategoriesScreen(inner, state, nav)
                        is Route.Reviews -> ReviewsScreen(inner, nav)
                        is Route.Support -> SupportScreen(inner, state, nav, toast)
                    }
                }
            }
        }
    }
}
