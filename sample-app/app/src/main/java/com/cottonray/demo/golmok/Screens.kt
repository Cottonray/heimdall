package com.example.demo.golmok

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

// ── 탭 다섯 ──────────────────────────────────────────────────────────────────

@Composable
fun TabsScreen(
    modifier: Modifier,
    tab: Int,
    onTab: (Int) -> Unit,
    items: List<Copy.Item>,
    liked: Set<Int>,
    onOpenItem: (Int) -> Unit,
    onSearch: () -> Unit,
    onSell: () -> Unit,
    onOpenChat: (String, String) -> Unit,
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
                    onClick = onSell,
                    containerColor = Brand,
                    contentColor = Color.White,
                    modifier = Modifier.testTag("sell_fab"),
                ) { Text(Copy.home.sellButton, fontWeight = FontWeight.Bold) }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad)) {
            when (tab) {
                0 -> HomeTab(items, onOpenItem, onSearch)
                1 -> CommunityTab()
                2 -> NearbyTab()
                3 -> ChatTab(onOpenChat)
                else -> ProfileTab(liked)
            }
        }
    }
}

@Composable
private fun HomeTab(items: List<Copy.Item>, onOpenItem: (Int) -> Unit, onSearch: () -> Unit) {
    var chip by remember { mutableStateOf(Copy.home.filterChips.first()) }
    val shown = remember(chip, items) {
        when {
            chip.contains("나눔") -> items.filter { it.price <= 0 }
            chip.contains("예약") -> items.filter { !it.badge.contains("예약") }
            else -> items
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().height(52.dp).padding(start = 16.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(Copy.home.town, style = MaterialTheme.typography.titleLarge)
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null)
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onSearch, modifier = Modifier.testTag("search_open")) {
                Icon(Icons.Filled.Search, contentDescription = "검색")
            }
            IconButton(onClick = {}) { Icon(Icons.Filled.Notifications, contentDescription = "알림") }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Copy.home.filterChips.forEach { label -> Chip(label, label == chip) { chip = label } }
        }
        Spacer(Modifier.height(4.dp))
        HorizontalDivider(color = Line)
        LazyColumn(state = rememberLazyListState(), modifier = Modifier.testTag("home_list")) {
            items(shown, key = { it.id }) { ItemRow(it) { onOpenItem(it.id) } }
        }
    }
}

@Composable
private fun CommunityTab() {
    Column(Modifier.fillMaxSize()) {
        Text(
            Copy.tabs[1],
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(16.dp),
        )
        HorizontalDivider(color = Line)
        LazyColumn(modifier = Modifier.testTag("community_list")) {
            itemsIndexed(Copy.community) { i, post ->
                Column(Modifier.fillMaxWidth().clickable {}.padding(16.dp).testTag("post_$i")) {
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
                        "댓글 ${post.comments} · 공감 ${post.likes}",
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
private fun NearbyTab() {
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(16.dp)) {
            Text(Copy.nearby.title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(4.dp))
            Text(Copy.nearby.sub, style = MaterialTheme.typography.bodyMedium, color = Sub)
        }
        HorizontalDivider(color = Line)
        LazyColumn(modifier = Modifier.testTag("nearby_list")) {
            itemsIndexed(Copy.nearby.places) { i, place ->
                Row(Modifier.fillMaxWidth().clickable {}.padding(16.dp).testTag("place_$i")) {
                    Thumb(place.name, size = 56, corner = 28)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(place.name, style = MaterialTheme.typography.titleMedium)
                        Text("${place.category} · ${place.town}", style = MaterialTheme.typography.labelSmall, color = Sub)
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
private fun ChatTab(onOpenChat: (String, String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Text(Copy.tabs[3], style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
        HorizontalDivider(color = Line)
        if (Copy.chatList.isEmpty()) {
            EmptyNote(Copy.misc.emptyChat)
            return@Column
        }
        LazyColumn(modifier = Modifier.testTag("chat_list")) {
            itemsIndexed(Copy.chatList) { i, room ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenChat(room.nick, room.itemTitle) }
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
                                .padding(horizontal = 7.dp, vertical = 2.dp),
                        ) { Text("${room.unread}", color = Color.White, style = MaterialTheme.typography.labelSmall) }
                    }
                }
                HorizontalDivider(color = Line)
            }
        }
    }
}

@Composable
private fun ProfileTab(liked: Set<Int>) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).testTag("profile")) {
        Text(Copy.app.myTabLabel, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
        HorizontalDivider(color = Line)
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Thumb(Copy.profile.nick, size = 56, corner = 28)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(Copy.profile.nick, style = MaterialTheme.typography.titleMedium)
                Text(Copy.profile.town, style = MaterialTheme.typography.labelSmall, color = Sub)
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
            listOf(
                Copy.profile.sales to "3",
                Copy.profile.purchases to "5",
                Copy.profile.likes to "${liked.size}",
            ).forEach { (label, value) ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(value, style = MaterialTheme.typography.titleMedium, color = Brand)
                    Text(label, style = MaterialTheme.typography.labelSmall, color = Sub)
                }
            }
        }
        HorizontalDivider(color = Line)
        Copy.profile.menu.forEachIndexed { i, label ->
            Text(
                label,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {}
                    .padding(16.dp)
                    .testTag("menu_$i"),
            )
            HorizontalDivider(color = Line)
        }
    }
}

// ── 검색 ─────────────────────────────────────────────────────────────────────

@Composable
fun SearchScreen(modifier: Modifier, items: List<Copy.Item>, onBack: () -> Unit, onOpenItem: (Int) -> Unit) {
    var query by remember { mutableStateOf("") }
    val hits = remember(query, items) {
        if (query.isBlank()) emptyList()
        else items.filter { it.title.contains(query, true) || it.category.contains(query, true) }
    }
    Column(modifier.fillMaxSize()) {
        TopBar("", onBack) {}
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(Copy.home.searchPlaceholder) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("search_input"),
        )
        Spacer(Modifier.height(8.dp))
        when {
            query.isBlank() -> EmptyNote(Copy.home.searchPlaceholder)
            hits.isEmpty() -> EmptyNote(Copy.misc.searchEmpty)
            else -> LazyColumn(modifier = Modifier.testTag("search_list")) {
                items(hits, key = { it.id }) { ItemRow(it) { onOpenItem(it.id) } }
            }
        }
    }
}

// ── 상세 ─────────────────────────────────────────────────────────────────────

@Composable
fun DetailScreen(
    modifier: Modifier,
    item: Copy.Item,
    others: List<Copy.Item>,
    liked: Boolean,
    onToggleLike: () -> Unit,
    onBack: () -> Unit,
    onChat: () -> Unit,
) {
    Column(modifier.fillMaxSize()) {
        TopBar(item.title, onBack) {
            TextButton(onClick = {}) { Text(Copy.detail.reportLabel, style = MaterialTheme.typography.labelSmall, color = Sub) }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).testTag("detail")) {
            Thumb(item.title, size = 300, corner = 0, fillWidth = true)
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
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
                Text("관심 ${item.likes} · 채팅 ${item.chatCount}", style = MaterialTheme.typography.labelSmall, color = Sub)
            }
            if (others.isNotEmpty()) {
                HorizontalDivider(color = Line, modifier = Modifier.padding(vertical = 12.dp))
                Text(Copy.detail.sellerOtherLabel, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp))
                Spacer(Modifier.height(8.dp))
                others.take(4).forEach { other ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
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
            IconButton(onClick = onToggleLike, modifier = Modifier.testTag("like")) {
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
            Button(
                onClick = onChat,
                colors = ButtonDefaults.buttonColors(containerColor = Brand),
                modifier = Modifier.testTag("chat_button"),
            ) { Text(Copy.detail.chatButton, fontWeight = FontWeight.Bold) }
        }
    }
}

// ── 채팅 ─────────────────────────────────────────────────────────────────────

@Composable
fun ChatScreen(modifier: Modifier, peer: String, itemTitle: String, onBack: () -> Unit) {
    // 미리 적어 둔 대화로 시작하고, 보낸 말은 뒤에 붙는다. 되돌아오는 답은 없다 —
    // 없는 상대가 답하는 척하면 시나리오가 그 타이밍에 얹혀 흔들린다
    val messages = remember(peer) { mutableStateListOf<Copy.Message>().also { it.addAll(Copy.chatThread.messages) } }
    var draft by remember { mutableStateOf("") }

    Column(modifier.fillMaxSize()) {
        TopBar(peer, onBack)
        Row(Modifier.fillMaxWidth().background(Color(0xFFF7F7F8)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Thumb(itemTitle, size = 40)
            Spacer(Modifier.width(10.dp))
            Text(itemTitle, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        LazyColumn(modifier = Modifier.weight(1f).padding(horizontal = 12.dp).testTag("chat_thread")) {
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
            Button(
                onClick = {
                    if (draft.isNotBlank()) {
                        messages.add(Copy.Message(fromMe = true, text = draft.trim()))
                        draft = ""
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Brand),
                modifier = Modifier.testTag("chat_send"),
            ) { Text("전송") }
        }
    }
}

// ── 글쓰기 ────────────────────────────────────────────────────────────────────

@Composable
fun SellScreen(modifier: Modifier, onBack: () -> Unit, onSubmit: (String, Int, String) -> Unit) {
    var title by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var free by remember { mutableStateOf(false) }
    val canSubmit = title.isNotBlank() && (free || price.isNotBlank())

    Column(modifier.fillMaxSize()) {
        TopBar(Copy.sell.title, onBack)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp).testTag("sell_form")) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFFF7F7F8)),
                contentAlignment = Alignment.Center,
            ) { Text(Copy.sell.photoHint, color = Sub, style = MaterialTheme.typography.bodyMedium) }
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
        }
        HorizontalDivider(color = Line)
        Button(
            onClick = { onSubmit(title.trim(), if (free) 0 else price.toIntOrNull() ?: 0, desc.trim()) },
            enabled = canSubmit,
            colors = ButtonDefaults.buttonColors(containerColor = Brand),
            modifier = Modifier.fillMaxWidth().padding(16.dp).height(48.dp).testTag("sell_submit"),
        ) { Text(Copy.sell.submit, fontWeight = FontWeight.Bold) }
    }
}
