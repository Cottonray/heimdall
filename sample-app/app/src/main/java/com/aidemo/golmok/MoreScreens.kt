package com.aidemo.golmok

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * 탭 다섯과 검색·상세·채팅·글쓰기 뒤에 있는 화면들.
 *
 * 하나같이 작다 — 목록 하나, 단추 하나, 그 결과가 **화면의 글자로** 남는 것이 전부다.
 * QA 시나리오는 `assertVisible` 로 글자를 보므로, 눌러서 바뀐 것은 스낵바(사라진다)만이
 * 아니라 화면에 남는 글자(딱지·숫자·안내 줄)로도 보여야 한다.
 */

// ── 알림 ─────────────────────────────────────────────────────────────────────

@Composable
fun NotificationsScreen(modifier: Modifier, state: AppState, nav: Nav) {
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.notifications.title, { nav.pop() }) {
            TextButton(onClick = { state.readAllNotices() }, modifier = Modifier.testTag("notice_read_all")) {
                Text(Copy.notifications.markAllRead, color = Brand, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (state.notices.isEmpty()) {
            EmptyNote(Copy.notifications.empty, tag = "notice_empty")
            return@Column
        }
        LazyColumn(modifier = Modifier.testTag("notice_list")) {
            itemsIndexed(state.notices) { i, n ->
                Row(
                    Modifier.fillMaxWidth().clickable { state.readNotice(i) }.padding(16.dp).testTag("notice_$i"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            n.title,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = if (n.read) FontWeight.Normal else FontWeight.Bold,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(n.body, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF4A4A4A))
                        Spacer(Modifier.height(2.dp))
                        Text(n.ago, style = MaterialTheme.typography.labelSmall, color = Sub)
                    }
                    if (!n.read) Badge(Copy.notifications.unread, Modifier.testTag("notice_unread_$i"))
                }
                HorizontalDivider(color = Line)
            }
        }
    }
}

// ── 동네 고르기 ───────────────────────────────────────────────────────────────

@Composable
fun TownPickerScreen(modifier: Modifier, state: AppState, nav: Nav, toast: (String) -> Unit) {
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.home.townPickerTitle, { nav.pop() })
        Text(
            Copy.home.townPickerHint,
            style = MaterialTheme.typography.bodyMedium,
            color = Sub,
            modifier = Modifier.padding(16.dp),
        )
        HorizontalDivider(color = Line)
        LazyColumn(modifier = Modifier.testTag("town_list")) {
            itemsIndexed(Copy.towns) { i, t ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            state.changeTown(t.name)
                            toast(Copy.home.townChanged.fill("town" to t.name))
                            nav.pop()
                        }
                        .padding(16.dp)
                        .testTag("town_$i"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(t.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    if (t.name == state.town) {
                        Icon(Icons.Filled.Check, contentDescription = null, tint = Brand, modifier = Modifier.testTag("town_current"))
                    }
                }
                HorizontalDivider(color = Line)
            }
        }
    }
}

// ── 판매자 ───────────────────────────────────────────────────────────────────

@Composable
fun SellerScreen(modifier: Modifier, state: AppState, nick: String, nav: Nav) {
    val items = state.allItems.filter { it.sellerNick == nick }
    val first = items.firstOrNull()
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.detail.sellerScreenTitle, { nav.pop() })
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Thumb(nick, size = 56, corner = 28)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(nick, style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("seller_nick"))
                Text(first?.town ?: state.town, style = MaterialTheme.typography.labelSmall, color = Sub)
            }
            TempBar(first?.sellerTemp ?: "36.5", Copy.app.tempLabel)
        }
        HorizontalDivider(color = Line)
        SectionTitle(Copy.detail.sellerItemsLabel)
        if (items.isEmpty()) {
            EmptyNote(Copy.detail.sellerNoItems, tag = "seller_empty")
            return@Column
        }
        LazyColumn(modifier = Modifier.testTag("seller_list")) {
            items(items, key = { it.id }) { item -> ItemRow(item) { nav.push(Route.Detail(item.id)) } }
        }
    }
}

// ── 동네생활 글 ───────────────────────────────────────────────────────────────

@Composable
fun PostScreen(modifier: Modifier, state: AppState, postId: Int, nav: Nav) {
    val post = state.posts.firstOrNull { it.id == postId } ?: return
    var draft by remember { mutableStateOf("") }

    Column(modifier.fillMaxSize()) {
        TopBar(Copy.board.postScreenTitle, { nav.pop() })
        LazyColumn(modifier = Modifier.weight(1f).testTag("post_body")) {
            item {
                Column(Modifier.padding(16.dp)) {
                    Badge(post.tag)
                    Spacer(Modifier.height(8.dp))
                    Text(post.title, style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(4.dp))
                    Text("${post.nick} · ${post.town} · ${post.ago}", style = MaterialTheme.typography.labelSmall, color = Sub)
                    Spacer(Modifier.height(12.dp))
                    Text(post.body, style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // 공감은 한 번만. 다시 누르면 뺀다 — 숫자가 같이 움직인다
                        TextButton(onClick = { post.liked = !post.liked }, modifier = Modifier.testTag("post_like")) {
                            Icon(
                                Icons.Filled.ThumbUp,
                                contentDescription = null,
                                tint = if (post.liked) Brand else Sub,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                if (post.liked) Copy.board.liked else Copy.board.like,
                                color = if (post.liked) Brand else Sub,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        Text(
                            Copy.misc.commentCount.fill("n" to post.comments.size) + " · " + Copy.misc.empathyCount.fill("n" to post.likes),
                            style = MaterialTheme.typography.labelSmall,
                            color = Sub,
                            modifier = Modifier.testTag("post_counts"),
                        )
                    }
                }
                HorizontalDivider(color = Line)
                SectionTitle(Copy.board.commentsLabel.fill("n" to post.comments.size), Modifier.testTag("comments_label"))
            }
            if (post.comments.isEmpty()) {
                item {
                    Text(
                        Copy.board.commentEmpty,
                        color = Sub,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).testTag("comment_empty"),
                    )
                }
            }
            itemsIndexed(post.comments) { i, c -> NoteRow(c.nick, c.text, c.ago, "comment_$i") }
        }
        HorizontalDivider(color = Line)
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = { Text(Copy.board.commentPlaceholder) },
                singleLine = true,
                modifier = Modifier.weight(1f).testTag("comment_input"),
            )
            Spacer(Modifier.width(8.dp))
            PrimaryButton(Copy.board.commentSend, "comment_send") {
                if (draft.isNotBlank()) {
                    state.addComment(post, draft.trim())
                    draft = ""
                }
            }
        }
    }
}

@Composable
fun PostWriteScreen(modifier: Modifier, state: AppState, nav: Nav, onDone: () -> Unit) {
    val tags = state.postTags
    var tag by remember { mutableStateOf(tags.firstOrNull() ?: "") }
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    Column(modifier.fillMaxSize()) {
        TopBar(Copy.board.writeTitle, { nav.pop() })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp).testTag("post_form")) {
            Text(Copy.board.tagLabel, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            ChipRow(tags, { it == tag }) { tag = it }
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                placeholder = { Text(Copy.board.titlePlaceholder) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("post_title"),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = body,
                onValueChange = { body = it },
                placeholder = { Text(Copy.board.bodyPlaceholder) },
                minLines = 6,
                modifier = Modifier.fillMaxWidth().testTag("post_body_input"),
            )
        }
        ErrorLine(error, "post_error")
        HorizontalDivider(color = Line)
        PrimaryButton(
            Copy.board.submit,
            "post_submit",
            modifier = Modifier.fillMaxWidth().padding(16.dp).height(48.dp),
        ) {
            error = when {
                title.isBlank() -> Copy.board.needTitle
                body.isBlank() -> Copy.board.needBody
                else -> null
            }
            if (error == null) {
                state.addPost(tag, title.trim(), body.trim())
                onDone()
            }
        }
    }
}

// ── 가게 ─────────────────────────────────────────────────────────────────────

@Composable
fun PlaceScreen(modifier: Modifier, state: AppState, index: Int, nav: Nav, toast: (String) -> Unit) {
    val place = Copy.nearby.places.getOrNull(index) ?: return
    val favorite = index in state.favoritePlaces
    val reviews = state.reviews(index)
    var draft by remember { mutableStateOf("") }

    Column(modifier.fillMaxSize()) {
        TopBar(Copy.nearby.placeScreenTitle, { nav.pop() })
        LazyColumn(modifier = Modifier.weight(1f).testTag("place_body")) {
            item {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Thumb(place.name, size = 64, corner = 32)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(place.name, style = MaterialTheme.typography.titleLarge)
                        Text(
                            "${place.category} · ${place.town} · ${formatDistance(state.distanceKm(place.town, place.name))}",
                            style = MaterialTheme.typography.labelSmall,
                            color = Sub,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text("★".repeat(place.stars), style = MaterialTheme.typography.labelSmall, color = Brand)
                    }
                }
                Text(
                    place.review,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                Spacer(Modifier.height(12.dp))
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    PrimaryButton(if (favorite) Copy.nearby.favorited else Copy.nearby.favorite, "place_favorite") {
                        state.toggleFavorite(index)
                    }
                    if (favorite) {
                        Spacer(Modifier.width(8.dp))
                        Icon(Icons.Filled.Star, contentDescription = null, tint = Brand, modifier = Modifier.testTag("place_star"))
                    }
                }
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = Line)
                SectionTitle(Copy.nearby.reviewsLabel.fill("n" to reviews.size), Modifier.testTag("reviews_label"))
            }
            itemsIndexed(reviews) { i, r -> NoteRow(r.nick, r.text, null, "review_$i") }
        }
        HorizontalDivider(color = Line)
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = { Text(Copy.nearby.reviewPlaceholder) },
                singleLine = true,
                modifier = Modifier.weight(1f).testTag("review_input"),
            )
            Spacer(Modifier.width(8.dp))
            PrimaryButton(Copy.nearby.reviewSubmit, "review_submit") {
                if (draft.isNotBlank()) {
                    state.addReview(index, draft.trim())
                    draft = ""
                    toast(Copy.nearby.reviewDone)
                }
            }
        }
    }
}

// ── 나의 골목 아래 화면들 ───────────────────────────────────────────────────────

@Composable
fun SalesScreen(modifier: Modifier, state: AppState, nav: Nav) {
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.profile.sales, { nav.pop() })
        if (state.added.isEmpty() && Copy.profile.salesItems.isEmpty()) {
            EmptyNote(Copy.profile.emptySales, tag = "sales_empty")
            return@Column
        }
        LazyColumn(modifier = Modifier.testTag("sales_list")) {
            // 이번에 올린 물건이 먼저. 그 아래가 미리 적힌 내역이다
            itemsIndexed(state.added) { i, item ->
                Row(
                    Modifier.fillMaxWidth().clickable { nav.push(Route.Detail(item.id)) }.padding(16.dp).testTag("sale_new_$i"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Thumb(item.title, size = 56)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item.title, style = MaterialTheme.typography.bodyLarge)
                        Text(formatPrice(item.price), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    }
                    Text(item.ago, style = MaterialTheme.typography.labelSmall, color = Sub)
                }
                HorizontalDivider(color = Line)
            }
            itemsIndexed(Copy.profile.salesItems) { i, s ->
                Row(Modifier.fillMaxWidth().padding(16.dp).testTag("sale_$i"), verticalAlignment = Alignment.CenterVertically) {
                    Thumb(s.title, size = 56)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(s.title, style = MaterialTheme.typography.bodyLarge)
                        Text(formatPrice(s.price), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    }
                    Badge(s.status)
                }
                HorizontalDivider(color = Line)
            }
        }
    }
}

@Composable
fun PurchasesScreen(modifier: Modifier, nav: Nav) {
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.profile.purchases, { nav.pop() })
        if (Copy.profile.purchaseItems.isEmpty()) {
            EmptyNote(Copy.profile.emptyPurchases, tag = "purchases_empty")
            return@Column
        }
        LazyColumn(modifier = Modifier.testTag("purchases_list")) {
            itemsIndexed(Copy.profile.purchaseItems) { i, p ->
                Row(Modifier.fillMaxWidth().padding(16.dp).testTag("purchase_$i"), verticalAlignment = Alignment.CenterVertically) {
                    Thumb(p.title, size = 56)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(p.title, style = MaterialTheme.typography.bodyLarge)
                        Text(formatPrice(p.price), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    }
                    Text(p.seller, style = MaterialTheme.typography.labelSmall, color = Sub)
                }
                HorizontalDivider(color = Line)
            }
        }
    }
}

@Composable
fun LikesScreen(modifier: Modifier, state: AppState, nav: Nav) {
    val items = state.allItems.filter { it.id in state.liked }
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.profile.likes, { nav.pop() })
        if (items.isEmpty()) {
            EmptyNote(Copy.misc.emptyLikes, tag = "likes_empty")
            return@Column
        }
        LazyColumn(modifier = Modifier.testTag("likes_list")) {
            items(items, key = { it.id }) { item -> ItemRow(item) { nav.push(Route.Detail(item.id)) } }
        }
    }
}

@Composable
fun VerifyScreen(modifier: Modifier, state: AppState, nav: Nav) {
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.profile.menu[1], { nav.pop() })
        Column(
            Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(Icons.Filled.Place, contentDescription = null, tint = Brand, modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(12.dp))
            Text(
                Copy.profile.verifyBody.fill("town" to state.town),
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.testTag("verify_body"),
            )
            Spacer(Modifier.height(20.dp))
            if (state.verified) {
                Badge(Copy.profile.verifiedBadge, Modifier.testTag("verify_badge"))
                Spacer(Modifier.height(8.dp))
                Text(
                    Copy.profile.verifyDone.fill("town" to state.town),
                    color = Brand,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.testTag("verify_done"),
                )
            } else {
                PrimaryButton(Copy.profile.verifyButton, "verify_button") { state.verifyTown() }
            }
        }
    }
}

@Composable
fun NotifySettingsScreen(modifier: Modifier, state: AppState, nav: Nav) {
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.profile.menu[2], { nav.pop() })
        Copy.profile.notifyItems.forEachIndexed { i, label ->
            val on = state.notifyOn.getOrNull(i) ?: false
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                // 스위치 그림만으로는 시나리오가 상태를 못 읽는다. 켜짐/꺼짐을 글자로도 둔다
                Text(
                    if (on) Copy.profile.on else Copy.profile.off,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (on) Brand else Sub,
                    modifier = Modifier.padding(end = 8.dp).testTag("notify_state_$i"),
                )
                Switch(
                    checked = on,
                    onCheckedChange = { if (i in state.notifyOn.indices) state.notifyOn[i] = it },
                    colors = SwitchDefaults.colors(checkedTrackColor = Brand),
                    modifier = Modifier.testTag("notify_switch_$i"),
                )
            }
            HorizontalDivider(color = Line)
        }
    }
}

@Composable
fun CategoriesScreen(modifier: Modifier, state: AppState, nav: Nav) {
    val categories = remember { Copy.items.map { it.category }.filter { it.isNotEmpty() }.distinct() }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        TopBar(Copy.profile.menu[3], { nav.pop() })
        Text(
            Copy.profile.categoryHint,
            style = MaterialTheme.typography.bodyMedium,
            color = Sub,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
        Text(
            Copy.profile.categoryCount.fill("n" to state.interests.size),
            style = MaterialTheme.typography.titleMedium,
            color = Brand,
            modifier = Modifier.padding(horizontal = 16.dp).testTag("category_count"),
        )
        Spacer(Modifier.height(12.dp))
        Box(Modifier.padding(horizontal = 16.dp)) {
            ChipRow(categories, { it in state.interests }) { state.toggleInterest(it) }
        }
    }
}

@Composable
fun ReviewsScreen(modifier: Modifier, nav: Nav) {
    Column(modifier.fillMaxSize()) {
        TopBar(Copy.profile.menu[4], { nav.pop() })
        LazyColumn(modifier = Modifier.testTag("trade_reviews")) {
            itemsIndexed(Copy.profile.reviews) { i, r -> NoteRow(r.nick, r.text, r.ago, "trade_review_$i") }
        }
    }
}

@Composable
fun SupportScreen(modifier: Modifier, state: AppState, nav: Nav, toast: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        TopBar(Copy.profile.menu[5], { nav.pop() })
        SectionTitle(Copy.profile.faqLabel)
        Copy.profile.faq.forEachIndexed { i, f ->
            var open by remember { mutableStateOf(false) }
            Column(Modifier.fillMaxWidth().clickable { open = !open }.padding(16.dp).testTag("faq_$i")) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(f.q, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    Icon(
                        if (open) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                        contentDescription = null,
                        tint = Sub,
                    )
                }
                if (open) {
                    Spacer(Modifier.height(8.dp))
                    Text(f.a, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF4A4A4A), modifier = Modifier.testTag("faq_answer_$i"))
                }
            }
            HorizontalDivider(color = Line)
        }
        SectionTitle(Copy.profile.inquiryLabel, Modifier.padding(top = 8.dp))
        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            placeholder = { Text(Copy.profile.inquiryPlaceholder) },
            minLines = 4,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("inquiry_input"),
        )
        ErrorLine(error, "inquiry_error")
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            PrimaryButton(Copy.profile.inquirySubmit, "inquiry_submit") {
                if (draft.isBlank()) {
                    error = Copy.profile.needInquiry
                } else {
                    state.inquiries.add(draft.trim())
                    draft = ""
                    error = null
                    toast(Copy.profile.inquiryDone)
                }
            }
            if (state.inquiries.isNotEmpty()) {
                Spacer(Modifier.width(12.dp))
                Text(
                    Copy.profile.inquiryDone,
                    color = Brand,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.testTag("inquiry_done"),
                )
            }
        }
    }
}
