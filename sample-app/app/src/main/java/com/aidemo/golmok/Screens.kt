package com.aidemo.golmok

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

// ── 탭 다섯 ──────────────────────────────────────────────────────────────────

@Composable
fun TabsScreen(
    modifier: Modifier,
    tab: Int,
    onTab: (Int) -> Unit,
    state: AppState,
    nav: Nav,
) {
    val icons = listOf(
        Icons.Filled.Home,
        Icons.AutoMirrored.Filled.List,
        Icons.Filled.Place,
        Icons.Filled.Email,
        Icons.Filled.Person,
    )
    Scaffold(
        modifier = modifier,
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                Copy.tabs.forEachIndexed { i, label ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { onTab(i) },
                        icon = { Icon(icons[i], contentDescription = label) },
                        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.testTag("tab_$i"),
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Ink,
                            selectedTextColor = Ink,
                            unselectedIconColor = Sub,
                            unselectedTextColor = Sub,
                            indicatorColor = Color.White,
                        ),
                    )
                }
            }
        },
        floatingActionButton = {
            // 글쓰기는 홈에서만 띄운다. 다른 탭에서 눌러도 갈 곳이 같아서 헷갈릴 뿐이다
            if (tab == 0) {
                ExtendedFloatingActionButton(
                    onClick = { nav.push(Route.Sell) },
                    containerColor = Brand,
                    contentColor = Color.White,
                    modifier = Modifier.testTag("sell_fab"),
                ) { Text(Copy.home.sellButton, fontWeight = FontWeight.Bold) }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad)) {
            when (tab) {
                0 -> HomeTab(state, nav)
                1 -> CommunityTab(state, nav)
                2 -> NearbyTab(state, nav)
                3 -> ChatTab(state, nav)
                else -> ProfileTab(state, nav)
            }
        }
    }
}

@Composable
private fun HomeTab(state: AppState, nav: Nav) {
    // 칩 순서는 copy.json 의 home.filterChips 그대로다: 전체 · 가까운 순 · 예약 제외 · 나눔.
    // 글자가 아니라 자리로 본다 — 문구를 고쳐도 거르기가 그대로여야 한다
    val chips = Copy.home.filterChips
    var chip by remember { mutableIntStateOf(0) }
    val items = state.allItems
    // 둘째 칩(가까운 순)만 정렬이고 나머지는 거르기다. 거리는 지금 동네에서 잰다
    val nearest = chip == 1
    val shown = remember(chip, items, state.town) {
        when (chip) {
            3 -> items.filter { it.price <= 0 }
            2 -> items.filter { it.badge != Copy.badges.reserved }
            1 -> items.sortedBy { state.distanceKm(it.town, it.title) }
            else -> items
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().height(52.dp).padding(start = 8.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // 동네 이름을 누르면 동네를 고른다. 화살표가 그걸 말해 준다
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { nav.push(Route.TownPicker) }
                    .padding(horizontal = 8.dp, vertical = 6.dp)
                    .testTag("town_select"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(state.town, style = MaterialTheme.typography.titleLarge)
                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null)
            }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { nav.push(Route.Search) }, modifier = Modifier.testTag("search_open")) {
                Icon(Icons.Filled.Search, contentDescription = Copy.misc.searchIcon)
            }
            Box {
                IconButton(onClick = { nav.push(Route.Notifications) }, modifier = Modifier.testTag("bell")) {
                    Icon(Icons.Filled.Notifications, contentDescription = Copy.misc.bellIcon)
                }
                // 안 읽은 알림 수. 0 이면 아무것도 안 그린다
                if (state.unreadNotices > 0) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = (-6).dp, y = 6.dp)
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(Brand)
                            .testTag("bell_count"),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${state.unreadNotices}", color = Color.White, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            chips.forEachIndexed { i, label -> Chip(label, i == chip) { chip = i } }
        }
        Spacer(Modifier.height(4.dp))
        HorizontalDivider(color = Line)
        LazyColumn(state = rememberLazyListState(), modifier = Modifier.testTag("home_list")) {
            // **웹 화면으로 들어가는 입구.** 목록 맨 위에 둔 것은 시나리오가 스크롤 없이
            // 닿게 하려는 것이다 — 섞인 흐름을 보여 주는 게 이 배너의 몫이다
            item {
                EventBanner { nav.push(Route.Web) }
                HorizontalDivider(color = Line)
            }
            items(shown, key = { it.id }) { item ->
                val distance = if (nearest) formatDistance(state.distanceKm(item.town, item.title)) else null
                ItemRow(item, distance) { nav.push(Route.Detail(item.id)) }
            }
        }
    }
}

@Composable
private fun CommunityTab(state: AppState, nav: Nav) {
    val all = Copy.board.tagAll
    var tag by remember { mutableStateOf(all) }
    val shown = if (tag == all) state.posts else state.posts.filter { it.tag == tag }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().height(52.dp).padding(start = 16.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(Copy.tabs[1], style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            TextButton(onClick = { nav.push(Route.PostWrite) }, modifier = Modifier.testTag("post_write")) {
                Icon(Icons.Filled.Create, contentDescription = null, tint = Brand, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text(Copy.board.write, color = Brand, fontWeight = FontWeight.Bold)
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            (listOf(all) + state.postTags).forEach { label -> Chip(label, label == tag) { tag = label } }
        }
        Spacer(Modifier.height(4.dp))
        HorizontalDivider(color = Line)
        LazyColumn(modifier = Modifier.testTag("community_list")) {
            itemsIndexed(shown, key = { _, p -> p.id }) { i, post ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clickable { nav.push(Route.Post(post.id)) }
                        .padding(16.dp)
                        .testTag("post_$i"),
                ) {
                    Badge(post.tag)
                    Spacer(Modifier.height(6.dp))
                    Text(post.title, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(post.body, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF4A4A4A), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "${post.nick} · ${post.town} · ${post.ago}",
                        style = MaterialTheme.typography.labelSmall,
                        color = Sub,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        Copy.misc.commentCount.fill("n" to post.comments.size) + " · " + Copy.misc.empathyCount.fill("n" to post.likes),
                        style = MaterialTheme.typography.labelSmall,
                        color = Sub,
                    )
                }
                HorizontalDivider(color = Line)
            }
        }
    }
}

@Composable
private fun NearbyTab(state: AppState, nav: Nav) {
    val chips = Copy.nearby.distanceChips
    var chip by remember { mutableStateOf(chips.first()) }
    // "2km 이내" 에서 숫자만 읽는다. 없으면(전체) 다 보인다
    val limit = chip.filter { it.isDigit() }.toIntOrNull()
    val places = Copy.nearby.places.withIndex().filter { (_, p) ->
        limit == null || state.distanceKm(p.town, p.name) <= limit
    }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(16.dp)) {
            Text(Copy.nearby.title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(4.dp))
            Text(Copy.nearby.sub, style = MaterialTheme.typography.bodyMedium, color = Sub)
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            chips.forEach { label -> Chip(label, label == chip) { chip = label } }
        }
        Spacer(Modifier.height(4.dp))
        HorizontalDivider(color = Line)
        LazyColumn(modifier = Modifier.testTag("nearby_list")) {
            items(places, key = { it.index }) { (i, place) ->
                Row(Modifier.fillMaxWidth().clickable { nav.push(Route.Place(i)) }.padding(16.dp).testTag("place_$i")) {
                    Thumb(place.name, size = 56, corner = 28)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(place.name, style = MaterialTheme.typography.titleMedium)
                            if (i in state.favoritePlaces) {
                                Spacer(Modifier.width(6.dp))
                                Badge(Copy.nearby.favorited)
                            }
                        }
                        Text(
                            "${place.category} · ${place.town} · ${formatDistance(state.distanceKm(place.town, place.name))}",
                            style = MaterialTheme.typography.labelSmall,
                            color = Sub,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text("★".repeat(place.stars), style = MaterialTheme.typography.labelSmall, color = Brand)
                        Spacer(Modifier.height(2.dp))
                        Text(place.review, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF4A4A4A))
                    }
                }
                HorizontalDivider(color = Line)
            }
        }
    }
}

@Composable
private fun ChatTab(state: AppState, nav: Nav) {
    Column(Modifier.fillMaxSize()) {
        Text(Copy.tabs[3], style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
        HorizontalDivider(color = Line)
        if (state.rooms.isEmpty()) {
            EmptyNote(Copy.misc.emptyChat)
            return@Column
        }
        LazyColumn(modifier = Modifier.testTag("chat_list")) {
            itemsIndexed(state.rooms, key = { _, r -> r.nick }) { i, room ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            state.openRoom(room.nick)
                            nav.push(Route.Chat(room.nick, room.itemTitle))
                        }
                        .padding(16.dp)
                        .testTag("chat_$i"),
                ) {
                    Thumb(room.nick, size = 48, corner = 24)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(room.nick, style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.width(6.dp))
                            Text("${room.town} · ${room.ago}", style = MaterialTheme.typography.labelSmall, color = Sub)
                        }
                        Spacer(Modifier.height(2.dp))
                        Text(room.last, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(2.dp))
                        Text(room.itemTitle, style = MaterialTheme.typography.labelSmall, color = Sub)
                    }
                    if (room.unread > 0) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(Brand)
                                .padding(horizontal = 7.dp, vertical = 2.dp)
                                .testTag("unread_$i"),
                        ) { Text("${room.unread}", color = Color.White, style = MaterialTheme.typography.labelSmall) }
                    }
                }
                HorizontalDivider(color = Line)
            }
        }
    }
}

@Composable
private fun ProfileTab(state: AppState, nav: Nav) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).testTag("profile")) {
        Text(Copy.app.myTabLabel, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
        HorizontalDivider(color = Line)
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Thumb(Copy.profile.nick, size = 56, corner = 28)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(Copy.profile.nick, style = MaterialTheme.typography.titleMedium)
                    if (state.verified) {
                        Spacer(Modifier.width(6.dp))
                        Badge(Copy.profile.verifiedBadge, Modifier.testTag("verified_badge"))
                    }
                }
                Text(state.town, style = MaterialTheme.typography.labelSmall, color = Sub)
            }
            TempBar("36.5", Copy.app.tempLabel)
        }
        Text(
            Copy.profile.tempCaption,
            style = MaterialTheme.typography.labelSmall,
            color = Sub,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        Spacer(Modifier.height(16.dp))
        HorizontalDivider(color = Line)
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            val stats = listOf(
                Triple(Copy.profile.sales, Copy.profile.salesItems.size + state.added.size, "stat_sales" to Route.Sales),
                Triple(Copy.profile.purchases, Copy.profile.purchaseItems.size, "stat_purchases" to Route.Purchases),
                Triple(Copy.profile.likes, state.liked.size, "stat_likes" to Route.Likes),
            )
            stats.forEach { (label, value, target) ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { nav.push(target.second) }
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .testTag(target.first),
                ) {
                    Text("$value", style = MaterialTheme.typography.titleMedium, color = Brand)
                    Text(label, style = MaterialTheme.typography.labelSmall, color = Sub)
                }
            }
        }
        HorizontalDivider(color = Line)

        // **여기가 웹에서 넘어온 값이 보이는 자리다.** 쿠폰은 웹 화면에서 받았고, 그 수를
        // 자바스크립트 다리가 앱에 넘겨 줬다 (WebScreen.kt 의 Bridge)
        Row(
            Modifier.fillMaxWidth().clickable { nav.push(Route.Web) }.padding(16.dp).testTag("coupon_row"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(Copy.event.couponTitle, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Text(
                if (state.coupons > 0) Copy.event.couponCount.fill("n" to state.coupons) else Copy.event.couponEmpty,
                style = MaterialTheme.typography.bodyMedium,
                color = if (state.coupons > 0) Brand else Sub,
                fontWeight = if (state.coupons > 0) FontWeight.Bold else FontWeight.Normal,
                modifier = Modifier.testTag("coupon_count"),
            )
        }
        HorizontalDivider(color = Line)

        val wish = state.entryWish
        if (wish != null) {
            Row(Modifier.fillMaxWidth().padding(16.dp).testTag("entry_row")) {
                Text(Copy.event.entryDone, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Text(wish, style = MaterialTheme.typography.bodyMedium, color = Brand)
            }
            HorizontalDivider(color = Line)
        }

        Text(
            Copy.event.menuLabel,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.fillMaxWidth().clickable { nav.push(Route.Web) }.padding(16.dp).testTag("menu_event"),
        )
        HorizontalDivider(color = Line)

        // 메뉴 순서는 copy.json 의 profile.menu 그대로다: 내 동네 설정 · 동네 인증 · 알림 설정 ·
        // 관심 카테고리 · 받은 거래 후기 · 고객센터
        val targets = listOf(
            Route.TownPicker,
            Route.Verify,
            Route.NotifySettings,
            Route.Categories,
            Route.Reviews,
            Route.Support,
        )
        Copy.profile.menu.forEachIndexed { i, label ->
            Text(
                label,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { targets.getOrNull(i)?.let { nav.push(it) } }
                    .padding(16.dp)
                    .testTag("menu_$i"),
            )
            HorizontalDivider(color = Line)
        }
    }
}

// ── 검색 ─────────────────────────────────────────────────────────────────────

@Composable
fun SearchScreen(modifier: Modifier, state: AppState, nav: Nav) {
    var query by remember { mutableStateOf("") }
    val items = state.allItems
    val hits = remember(query, items) {
        if (query.isBlank()) emptyList()
        else items.filter { it.title.contains(query, true) || it.category.contains(query, true) }
    }
    Column(modifier.fillMaxSize()) {
        TopBar("", { nav.pop() }) {}
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(Copy.home.searchPlaceholder) },
            singleLine = true,
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { query = "" }, modifier = Modifier.testTag("search_clear")) {
                        Icon(Icons.Filled.Clear, contentDescription = Copy.misc.clearIcon)
                    }
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { state.rememberSearch(query) }),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("search_input"),
        )
        Spacer(Modifier.height(8.dp))
        when {
            query.isBlank() -> RecentSearches(state) { query = it }
            hits.isEmpty() -> EmptyNote(Copy.misc.searchEmpty, tag = "search_empty")
            else -> Column {
                Text(
                    Copy.search.resultCount.fill("n" to hits.size),
                    style = MaterialTheme.typography.labelSmall,
                    color = Sub,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp).testTag("search_count"),
                )
                LazyColumn(modifier = Modifier.testTag("search_list")) {
                    items(hits, key = { it.id }) { item ->
                        ItemRow(item) {
                            state.rememberSearch(query)
                            nav.push(Route.Detail(item.id))
                        }
                    }
                }
            }
        }
    }
}

/** 입력칸이 비어 있을 때 보이는 최근 검색어. 누르면 그 말로 검색한다 */
@Composable
private fun RecentSearches(state: AppState, onPick: (String) -> Unit) {
    if (state.recentSearches.isEmpty()) {
        EmptyNote(Copy.home.searchPlaceholder, tag = "search_hint")
        return
    }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp).testTag("search_recent")) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(Copy.search.recentTitle, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = { state.recentSearches.clear() }, modifier = Modifier.testTag("search_recent_clear")) {
                    Text(Copy.search.clearRecent, color = Sub, style = MaterialTheme.typography.bodyMedium)
                }
            }
            ChipRow(state.recentSearches.toList(), { false }) { word ->
                state.rememberSearch(word)
                onPick(word)
            }
        }
        // 남는 자리에는 전처럼 안내 한 줄. 「상품 검색」 시나리오가 이 글자를 본다
        EmptyNote(Copy.home.searchPlaceholder, tag = "search_hint")
    }
}

// ── 상세 ─────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun DetailScreen(modifier: Modifier, state: AppState, itemId: Int, nav: Nav, toast: (String) -> Unit) {
    val all = state.allItems
    val item = all.firstOrNull { it.id == itemId } ?: all.first()
    val others = all.filter { it.sellerNick == item.sellerNick && it.id != item.id }
    val liked = item.id in state.liked
    val reported = item.id in state.reported
    var reportOpen by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf<String?>(null) }

    Column(modifier.fillMaxSize()) {
        TopBar(item.title, { nav.pop() }) {
            if (reported) {
                Badge(Copy.detail.reportedLabel, Modifier.padding(end = 12.dp).testTag("reported"))
            } else {
                TextButton(onClick = { reportOpen = true }, modifier = Modifier.testTag("report")) {
                    Text(Copy.detail.reportLabel, style = MaterialTheme.typography.labelSmall, color = Sub)
                }
            }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).testTag("detail")) {
            Thumb(item.title, size = 300, corner = 0, fillWidth = true)
            // 판매자 줄을 누르면 판매자 화면이다
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { nav.push(Route.Seller(item.sellerNick)) }
                    .padding(16.dp)
                    .testTag("seller"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Thumb(item.sellerNick, size = 40, corner = 20)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.sellerNick, style = MaterialTheme.typography.titleMedium)
                    Text(item.town, style = MaterialTheme.typography.labelSmall, color = Sub)
                }
                TempBar(item.sellerTemp, Copy.app.tempLabel)
            }
            Text(Copy.detail.tempCaption, style = MaterialTheme.typography.labelSmall, color = Sub, modifier = Modifier.padding(horizontal = 16.dp))
            HorizontalDivider(color = Line, modifier = Modifier.padding(vertical = 12.dp))
            Column(Modifier.padding(horizontal = 16.dp)) {
                Text(item.title, style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(4.dp))
                Text("${item.category} · ${item.ago}", style = MaterialTheme.typography.labelSmall, color = Sub)
                Spacer(Modifier.height(12.dp))
                Text(item.desc, style = MaterialTheme.typography.bodyLarge)
                Spacer(Modifier.height(12.dp))
                Text(
                    Copy.misc.likeCount.fill("n" to item.likes + (if (liked) 1 else 0)) + " · " + Copy.misc.chatCount.fill("n" to item.chatCount),
                    style = MaterialTheme.typography.labelSmall,
                    color = Sub,
                    modifier = Modifier.testTag("detail_counts"),
                )
            }
            if (others.isNotEmpty()) {
                HorizontalDivider(color = Line, modifier = Modifier.padding(vertical = 12.dp))
                Text(Copy.detail.sellerOtherLabel, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp))
                Spacer(Modifier.height(8.dp))
                others.take(4).forEach { other ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { nav.push(Route.Detail(other.id)) }
                            .padding(horizontal = 16.dp, vertical = 6.dp)
                            .testTag("other_${other.id}"),
                    ) {
                        Thumb(other.title, size = 56)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(other.title, style = MaterialTheme.typography.bodyLarge)
                            Text(formatPrice(other.price), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
        HorizontalDivider(color = Line)
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = {
                    val now = state.toggleLike(item.id)
                    toast(if (now) Copy.detail.likedToast else Copy.detail.unlikedToast)
                },
                modifier = Modifier.testTag("like"),
            ) {
                Icon(
                    if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = Copy.detail.likeLabel,
                    tint = if (liked) Brand else Sub,
                )
            }
            Spacer(Modifier.width(4.dp))
            Column(Modifier.weight(1f)) {
                Text(formatPrice(item.price), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            PrimaryButton(Copy.detail.chatButton, "chat_button") {
                nav.push(Route.Chat(item.sellerNick, item.title))
            }
        }
    }

    if (reportOpen) {
        AlertDialog(
            onDismissRequest = { reportOpen = false },
            // 대화상자는 창이 따로라 루트의 설정이 닿지 않는다. 여기서 다시 켜야 id: 로 집힌다
            modifier = Modifier.semantics { testTagsAsResourceId = true }.testTag("report_dialog"),
            title = { Text(Copy.detail.reportLabel) },
            text = {
                Column {
                    Copy.detail.reportReasons.forEachIndexed { i, label ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { reason = label }
                                .padding(vertical = 4.dp)
                                .testTag("report_reason_$i"),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = reason == label, onClick = null)
                            Spacer(Modifier.width(6.dp))
                            Text(label, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        state.report(item.id)
                        reportOpen = false
                        toast(Copy.detail.reportDone)
                    },
                    enabled = reason != null,
                    modifier = Modifier.testTag("report_submit"),
                ) { Text(Copy.detail.reportSubmit, color = if (reason != null) Brand else Sub, fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(onClick = { reportOpen = false }, modifier = Modifier.testTag("report_cancel")) {
                    Text(Copy.detail.reportCancel, color = Sub)
                }
            },
        )
    }
}

// ── 채팅 ─────────────────────────────────────────────────────────────────────

@Composable
fun ChatScreen(modifier: Modifier, state: AppState, peer: String, itemTitle: String, nav: Nav) {
    // 대화는 상태(State.kt)에 있다 — 뒤로 나갔다 들어와도 보낸 말과 받은 답이 그대로다
    val messages = state.thread(peer)
    var draft by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    LaunchedEffect(peer) { state.openRoom(peer) }
    // 새 말이 붙으면 맨 아래로. 안 그러면 보낸 말이 화면 밖에 있어 시나리오가 못 본다
    LaunchedEffect(messages.size) { if (messages.isNotEmpty()) listState.scrollToItem(messages.size - 1) }

    Column(modifier.fillMaxSize()) {
        TopBar(peer, { nav.pop() })
        Row(Modifier.fillMaxWidth().background(Color(0xFFF7F7F8)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Thumb(itemTitle, size = 40)
            Spacer(Modifier.width(10.dp))
            Text(itemTitle, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (messages.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(
                    Copy.chatThread.newRoomHint.fill("peer" to peer),
                    color = Sub,
                    modifier = Modifier.testTag("chat_empty"),
                )
            }
        } else {
            LazyColumn(state = listState, modifier = Modifier.weight(1f).padding(horizontal = 12.dp).testTag("chat_thread")) {
                itemsIndexed(messages) { i, m ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = if (m.fromMe) Arrangement.End else Arrangement.Start,
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(14.dp))
                                .background(if (m.fromMe) Brand else Color(0xFFF1F1F3))
                                .padding(horizontal = 12.dp, vertical = 8.dp)
                                .testTag("msg_$i"),
                        ) {
                            Text(m.text, color = if (m.fromMe) Color.White else Ink, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Copy.chatThread.quickReplies.forEach { quick ->
                Chip(quick, false) { draft = quick }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = { Text(Copy.chatThread.inputPlaceholder) },
                singleLine = true,
                modifier = Modifier.weight(1f).testTag("chat_input"),
            )
            Spacer(Modifier.width(8.dp))
            PrimaryButton(Copy.chatThread.sendButton, "chat_send") {
                if (draft.isNotBlank()) {
                    state.send(peer, itemTitle, draft.trim())
                    draft = ""
                }
            }
        }
    }
}

// ── 글쓰기 ────────────────────────────────────────────────────────────────────

@Composable
fun SellScreen(modifier: Modifier, state: AppState, nav: Nav, onDone: () -> Unit) {
    var title by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var free by remember { mutableStateOf(false) }
    var photos by remember { mutableIntStateOf(0) }
    var category by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    // 카테고리는 이미 올라온 물건들이 쓰는 것 그대로. 안 고르면 마지막 것(기타)이다
    val categories = remember { Copy.items.map { it.category }.filter { it.isNotEmpty() }.distinct() }

    Column(modifier.fillMaxSize()) {
        TopBar(Copy.sell.title, { nav.pop() })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp).testTag("sell_form")) {
            // 사진은 진짜로 고르지 않는다(에뮬레이터에 앨범이 없다). 누른 횟수만큼 장 수가 는다
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFFF7F7F8))
                    .clickable { photos += 1 }
                    .testTag("sell_photo"),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (photos == 0) Copy.sell.photoHint else Copy.sell.photoCount.fill("n" to photos),
                    color = if (photos == 0) Sub else Brand,
                    fontWeight = if (photos == 0) FontWeight.Normal else FontWeight.Bold,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                placeholder = { Text(Copy.sell.titlePlaceholder) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("sell_title"),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = price,
                onValueChange = { v -> price = v.filter { it.isDigit() } },
                placeholder = { Text(Copy.sell.pricePlaceholder) },
                singleLine = true,
                enabled = !free,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth().testTag("sell_price"),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = free, onCheckedChange = { free = it }, modifier = Modifier.testTag("sell_free"))
                Text(Copy.sell.freeCheck, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(4.dp))
            OutlinedTextField(
                value = desc,
                onValueChange = { desc = it },
                placeholder = { Text(Copy.sell.descPlaceholder) },
                minLines = 4,
                modifier = Modifier.fillMaxWidth().testTag("sell_desc"),
            )
            Spacer(Modifier.height(16.dp))
            Text(Copy.sell.categoryLabel, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            ChipRow(categories, { it == category }) { category = if (category == it) null else it }
            Spacer(Modifier.height(16.dp))
        }
        ErrorLine(error, "sell_error")
        HorizontalDivider(color = Line)
        PrimaryButton(
            Copy.sell.submit,
            "sell_submit",
            modifier = Modifier.fillMaxWidth().padding(16.dp).height(48.dp),
        ) {
            error = when {
                title.isBlank() -> Copy.sell.needTitle
                !free && price.isBlank() -> Copy.sell.needPrice
                else -> null
            }
            if (error == null) {
                state.addItem(
                    title = title.trim(),
                    price = if (free) 0 else price.toIntOrNull() ?: 0,
                    desc = desc.trim(),
                    category = category ?: categories.lastOrNull() ?: "",
                )
                onDone()
            }
        }
    }
}
