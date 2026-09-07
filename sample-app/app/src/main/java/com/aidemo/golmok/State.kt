package com.aidemo.golmok

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sqrt

/**
 * 앱이 켜져 있는 동안의 **모든 상태**가 여기 한 곳에 있다.
 *
 * 네트워크도 저장소도 없다. 눌러서 바뀐 것은 전부 메모리에만 남고, 시나리오가
 * `launchApp: clearState` 로 앱을 다시 띄우면 처음으로 돌아간다 — 같은 시나리오를
 * 몇 번이고 돌리는 데는 그게 낫다.
 *
 * 화면(Screens.kt·MoreScreens.kt)은 이 객체를 읽고 여기 있는 함수를 부를 뿐이다.
 * 상태를 화면 안에 두면 뒤로 나갔다 들어올 때 사라지고(예: 관심·댓글), QA 시나리오가
 * "눌렀는데 남지 않는다"를 실패로 본다.
 */
class AppState(private val scope: CoroutineScope) {

    // ── 동네 ────────────────────────────────────────────────────────────────
    var town by mutableStateOf(Copy.home.town)
        private set

    fun changeTown(name: String) {
        town = name
    }

    // ── 물건 ────────────────────────────────────────────────────────────────
    /** 등록한 물건은 목록 맨 위에 붙는다 */
    val added = mutableStateListOf<Copy.Item>()
    val allItems: List<Copy.Item> get() = added + Copy.items

    fun addItem(title: String, price: Int, desc: String, category: String) {
        // 새 물건은 기존 것과 겹치지 않는 번호를 받는다
        added.add(
            0,
            Copy.Item(
                id = 1000 + added.size,
                title = title,
                town = town,
                ago = Copy.misc.justNow,
                price = price,
                desc = desc,
                likes = 0,
                chatCount = 0,
                sellerNick = Copy.profile.nick,
                sellerTemp = "36.5",
                category = category,
                badge = "",
            ),
        )
    }

    var liked by mutableStateOf(setOf<Int>())
        private set

    /** 눌렀으면 true(담김), 다시 눌렀으면 false(뺌) */
    fun toggleLike(itemId: Int): Boolean {
        val now = itemId !in liked
        liked = if (now) liked + itemId else liked - itemId
        return now
    }

    var reported by mutableStateOf(setOf<Int>())
        private set

    fun report(itemId: Int) {
        reported = reported + itemId
    }

    // ── 채팅 ────────────────────────────────────────────────────────────────
    data class Room(
        val nick: String,
        val town: String,
        val ago: String,
        val last: String,
        val itemTitle: String,
        val unread: Int,
    )

    val rooms = mutableStateListOf<Room>().also { list ->
        Copy.chatList.forEach { list.add(Room(it.nick, it.town, it.ago, it.last, it.itemTitle, it.unread)) }
    }

    private val threads = mutableStateMapOf<String, SnapshotStateList<Copy.Message>>()
    private val sentCount = mutableMapOf<String, Int>()

    /**
     * 상대별 대화. 미리 적어 둔 대화는 한 사람(모퉁이햇살) 것뿐이고, 목록에 있는 다른 방은
     * 마지막 말 한 줄로 시작하며, 처음 여는 방은 비어 있다.
     */
    fun thread(peer: String): SnapshotStateList<Copy.Message> = threads.getOrPut(peer) {
        mutableStateListOf<Copy.Message>().also { list ->
            if (peer == Copy.chatThread.peerNick) {
                list.addAll(Copy.chatThread.messages)
            } else {
                rooms.firstOrNull { it.nick == peer }?.let { list.add(Copy.Message(fromMe = false, text = it.last)) }
            }
        }
    }

    fun openRoom(peer: String) {
        val i = rooms.indexOfFirst { it.nick == peer }
        if (i >= 0 && rooms[i].unread > 0) rooms[i] = rooms[i].copy(unread = 0)
    }

    /**
     * 보내면 1.5초 뒤 상대가 짧게 답한다. 답은 copy.json 의 `autoReplies` 를 보낸 순서대로
     * 돌려 쓴다 — 무작위면 같은 시나리오가 돌 때마다 다른 글자가 떠서 확인할 수 없다.
     */
    fun send(peer: String, itemTitle: String, text: String) {
        val list = thread(peer)
        list.add(Copy.Message(fromMe = true, text = text))
        touchRoom(peer, itemTitle, text)
        val n = (sentCount[peer] ?: 0)
        sentCount[peer] = n + 1
        val replies = Copy.chatThread.autoReplies
        if (replies.isEmpty()) return
        val reply = replies[n % replies.size]
        scope.launch {
            delay(1_500)
            list.add(Copy.Message(fromMe = false, text = reply))
            touchRoom(peer, itemTitle, reply)
            // 답이 오면 알림도 하나 쌓인다 — 종 아이콘의 숫자가 그걸 본다
            notices.add(0, Notice(Copy.notifications.items.first().title, "$peer · $reply", Copy.misc.justNow, read = false))
        }
    }

    /** 방을 목록 맨 위로 올리고 마지막 말을 바꾼다. 없던 방이면 만든다 */
    private fun touchRoom(peer: String, itemTitle: String, last: String) {
        val i = rooms.indexOfFirst { it.nick == peer }
        val base = if (i >= 0) rooms.removeAt(i) else Room(peer, town, Copy.misc.justNow, last, itemTitle, 0)
        rooms.add(0, base.copy(ago = Copy.misc.justNow, last = last, unread = 0))
    }

    // ── 동네생활 ─────────────────────────────────────────────────────────────
    class Post(
        val id: Int,
        val tag: String,
        val title: String,
        val body: String,
        val nick: String,
        val town: String,
        val ago: String,
        val baseLikes: Int,
        val comments: SnapshotStateList<Copy.Comment>,
    ) {
        var liked by mutableStateOf(false)
        val likes: Int get() = baseLikes + if (liked) 1 else 0
    }

    val posts = mutableStateListOf<Post>().also { list ->
        Copy.community.forEachIndexed { i, p ->
            val seeded = Copy.board.comments.getOrNull(i) ?: emptyList()
            list.add(Post(i, p.tag, p.title, p.body, p.nick, p.town, p.ago, p.likes, mutableStateListOf<Copy.Comment>().also { it.addAll(seeded) }))
        }
    }

    val postTags: List<String> get() = Copy.community.map { it.tag }.distinct()

    fun addPost(tag: String, title: String, body: String) {
        posts.add(0, Post(1000 + posts.size, tag, title, body, Copy.profile.nick, town, Copy.misc.justNow, 0, mutableStateListOf()))
    }

    fun addComment(post: Post, text: String) {
        post.comments.add(Copy.Comment(Copy.profile.nick, text, Copy.misc.justNow))
    }

    // ── 내 근처 ──────────────────────────────────────────────────────────────
    var favoritePlaces by mutableStateOf(setOf<Int>())
        private set

    fun toggleFavorite(place: Int) {
        favoritePlaces = if (place in favoritePlaces) favoritePlaces - place else favoritePlaces + place
    }

    private val placeReviews = mutableStateMapOf<Int, SnapshotStateList<Copy.Review>>()

    fun reviews(place: Int): SnapshotStateList<Copy.Review> = placeReviews.getOrPut(place) {
        mutableStateListOf<Copy.Review>().also { it.addAll(Copy.nearby.extraReviews.getOrNull(place) ?: emptyList()) }
    }

    fun addReview(place: Int, text: String) {
        reviews(place).add(Copy.Review(Copy.profile.nick, text))
    }

    // ── 알림 ────────────────────────────────────────────────────────────────
    data class Notice(val title: String, val body: String, val ago: String, val read: Boolean)

    val notices = mutableStateListOf<Notice>().also { list ->
        Copy.notifications.items.forEachIndexed { i, n -> list.add(Notice(n.title, n.body, n.ago, read = i >= 2)) }
    }
    val unreadNotices: Int get() = notices.count { !it.read }

    fun readNotice(index: Int) {
        if (index in notices.indices) notices[index] = notices[index].copy(read = true)
    }

    fun readAllNotices() {
        notices.indices.forEach { readNotice(it) }
    }

    // ── 나의 골목 ─────────────────────────────────────────────────────────────
    var verified by mutableStateOf(false)
        private set

    fun verifyTown() {
        verified = true
    }

    /** 알림 설정 항목마다 켜짐/꺼짐 */
    val notifyOn = mutableStateListOf<Boolean>().also { list ->
        Copy.profile.notifyItems.forEachIndexed { i, _ -> list.add(i < 2) }
    }

    var interests by mutableStateOf(setOf<String>())
        private set

    fun toggleInterest(category: String) {
        interests = if (category in interests) interests - category else interests + category
    }

    val inquiries = mutableStateListOf<String>()

    // ── 검색 ────────────────────────────────────────────────────────────────
    val recentSearches = mutableStateListOf<String>().also { it.addAll(Copy.search.seeds) }

    fun rememberSearch(query: String) {
        val q = query.trim()
        if (q.isEmpty()) return
        recentSearches.remove(q)
        recentSearches.add(0, q)
        while (recentSearches.size > 6) recentSearches.removeAt(recentSearches.lastIndex)
    }

    // ── 웹에서 넘어온 값 ──────────────────────────────────────────────────────
    // 이벤트 화면(웹)이 자바스크립트 다리로 알려 주고, 네이티브 화면(나의 골목)이 그걸
    // 보여 준다 — 섞인 흐름의 이음매다
    var coupons by mutableIntStateOf(0)
    var entryWish by mutableStateOf<String?>(null)

    // ── 거리 ────────────────────────────────────────────────────────────────

    /**
     * 지금 동네에서 그 동네까지. 같은 동네면 이름에서 뽑은 작은 값(0.2~0.8km) — 같은 동네라고
     * 전부 0 이면 "가까운 순"이 아무것도 정렬하지 못한다.
     */
    fun distanceKm(toTown: String, seed: String): Double {
        val from = Copy.towns.firstOrNull { it.name == town }
        val to = Copy.towns.firstOrNull { it.name == toTown }
        val jitter = (seed.sumOf { it.code } % 7) / 10.0
        if (from == null || to == null) return 1.0 + jitter
        if (from.name == to.name) return 0.2 + jitter
        val dLat = (to.lat - from.lat) * 111.0
        val dLng = (to.lng - from.lng) * 111.0 * cos(Math.toRadians(from.lat))
        return sqrt(dLat * dLat + dLng * dLng) + jitter
    }
}

/** 0.6 → "600m", 4.4 → "4.4km". 단위는 문구가 아니라 기호라 여기서 붙인다 */
fun formatDistance(km: Double): String =
    if (km < 1.0) "${(km * 100).toInt() * 10}m" else String.format(java.util.Locale.US, "%.1fkm", km)
