package com.aidemo.golmok

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 화면에 뜨는 **모든 말**은 `assets/copy.json` 한 파일에서 온다.
 *
 * 코틀린 안에 한국어를 흩어 두지 않는 이유는 둘이다.
 *  · 문구는 codex 가 쓰고 나는 구조만 짠다 (저장소 규칙). 받은 글을 손대지 않고 그대로
 *    파일에 넣으려면 파일 하나로 모여 있어야 한다
 *  · Maestro 시나리오가 **이 파일의 글자**를 그대로 찾는다. 두 곳에 적어 두면 한쪽만
 *    고쳐진 날 시나리오가 통째로 떨어진다
 *
 * 숫자 자리는 `{n}`, 동네는 `{town}`, 상대는 `{peer}` 다 — [fill] 로 끼운다.
 */
object Copy {
    lateinit var app: App private set
    lateinit var tabs: List<String> private set
    lateinit var home: Home private set
    lateinit var towns: List<Town> private set
    lateinit var items: List<Item> private set
    lateinit var badges: Badges private set
    lateinit var detail: Detail private set
    lateinit var community: List<Post> private set
    lateinit var board: Board private set
    lateinit var nearby: Nearby private set
    lateinit var chatList: List<ChatRoom> private set
    lateinit var chatThread: ChatThread private set
    lateinit var sell: Sell private set
    lateinit var profile: Profile private set
    lateinit var misc: Misc private set
    lateinit var event: Event private set
    lateinit var notifications: Notifications private set
    lateinit var search: Search private set

    data class App(
        val name: String,
        val tagline: String,
        val brandWord: String,
        val tempLabel: String,
        val myTabLabel: String,
    )

    data class Home(
        val town: String,
        val searchPlaceholder: String,
        val sellButton: String,
        val filterChips: List<String>,
        val townPickerTitle: String,
        val townPickerHint: String,
        /** `{town}` 자리 */
        val townChanged: String,
    )

    /** 동네 좌표. 거리(가까운 순·내 근처 거르기)는 여기서 계산한다 — 문구가 아니라 사실이다 */
    data class Town(val name: String, val lat: Double, val lng: Double)

    data class Item(
        val id: Int,
        val title: String,
        val town: String,
        val ago: String,
        val price: Int,
        val desc: String,
        val likes: Int,
        val chatCount: Int,
        val sellerNick: String,
        val sellerTemp: String,
        val category: String,
        val badge: String,
    )

    /**
     * 물건 딱지 두 가지. items 의 `badge` 값과 **같은 글자여야 한다** — 홈의 "예약 제외"와
     * 딱지 색이 이 글자로 가른다. 코틀린에 "예약중"을 적어 두지 않으려고 여기로 뺐다
     */
    data class Badges(val reserved: String, val done: String)

    data class Detail(
        val sellerOtherLabel: String,
        val likeLabel: String,
        val chatButton: String,
        val tempCaption: String,
        val reportLabel: String,
        val reportReasons: List<String>,
        val reportSubmit: String,
        val reportCancel: String,
        val reportDone: String,
        val reportedLabel: String,
        val likedToast: String,
        val unlikedToast: String,
        val sellerScreenTitle: String,
        val sellerItemsLabel: String,
        val sellerNoItems: String,
    )

    data class Post(
        val tag: String,
        val title: String,
        val body: String,
        val nick: String,
        val town: String,
        val ago: String,
        val comments: Int,
        val likes: Int,
    )

    data class Comment(val nick: String, val text: String, val ago: String)

    /** 동네생활의 글쓰기·글 상세 문구. 글 자체는 [community] 에 있다 */
    data class Board(
        val write: String,
        val writeTitle: String,
        val tagLabel: String,
        val titlePlaceholder: String,
        val bodyPlaceholder: String,
        val submit: String,
        val done: String,
        val needTitle: String,
        val needBody: String,
        val postScreenTitle: String,
        val commentPlaceholder: String,
        val commentSend: String,
        /** `{n}` 자리 */
        val commentsLabel: String,
        val commentEmpty: String,
        val like: String,
        val liked: String,
        val tagAll: String,
        /** 글 순서와 같은 순서. 글마다 미리 달린 댓글 */
        val comments: List<List<Comment>>,
    )

    data class Place(
        val name: String,
        val category: String,
        val town: String,
        val review: String,
        val stars: Int,
    )

    data class Review(val nick: String, val text: String)

    data class Nearby(
        val title: String,
        val sub: String,
        val places: List<Place>,
        val distanceChips: List<String>,
        val placeScreenTitle: String,
        val favorite: String,
        val favorited: String,
        /** `{n}` 자리 */
        val reviewsLabel: String,
        val reviewPlaceholder: String,
        val reviewSubmit: String,
        val reviewDone: String,
        /** 가게 순서와 같은 순서 */
        val extraReviews: List<List<Review>>,
    )

    data class ChatRoom(
        val nick: String,
        val town: String,
        val ago: String,
        val last: String,
        val itemTitle: String,
        val unread: Int,
    )

    data class Message(val fromMe: Boolean, val text: String)

    data class ChatThread(
        val peerNick: String,
        val itemTitle: String,
        val inputPlaceholder: String,
        val quickReplies: List<String>,
        val messages: List<Message>,
        val sendButton: String,
        /** `{peer}` 자리 */
        val newRoomHint: String,
        /** 보낸 메시지에 상대가 돌려주는 짧은 답. 보낸 순서대로 돌려 쓴다 */
        val autoReplies: List<String>,
    )

    data class Sell(
        val title: String,
        val photoHint: String,
        val titlePlaceholder: String,
        val pricePlaceholder: String,
        val freeCheck: String,
        val descPlaceholder: String,
        val submit: String,
        val doneToast: String,
        val categoryLabel: String,
        /** `{n}` 자리 */
        val photoCount: String,
        val needTitle: String,
        val needPrice: String,
    )

    data class SaleItem(val title: String, val price: Int, val status: String)
    data class PurchaseItem(val title: String, val price: Int, val seller: String)
    data class TradeReview(val nick: String, val text: String, val ago: String)
    data class Faq(val q: String, val a: String)

    data class Profile(
        val nick: String,
        val town: String,
        val tempCaption: String,
        val menu: List<String>,
        val sales: String,
        val purchases: String,
        val likes: String,
        val verifiedBadge: String,
        val emptySales: String,
        val emptyPurchases: String,
        val salesItems: List<SaleItem>,
        val purchaseItems: List<PurchaseItem>,
        /** `{town}` 자리 */
        val verifyBody: String,
        val verifyButton: String,
        /** `{town}` 자리 */
        val verifyDone: String,
        val notifyItems: List<String>,
        val on: String,
        val off: String,
        val categoryHint: String,
        /** `{n}` 자리 */
        val categoryCount: String,
        val reviews: List<TradeReview>,
        val faq: List<Faq>,
        val faqLabel: String,
        val inquiryLabel: String,
        val inquiryPlaceholder: String,
        val inquirySubmit: String,
        val inquiryDone: String,
        val needInquiry: String,
    )

    data class Misc(
        val emptyChat: String,
        val emptyLikes: String,
        val searchEmpty: String,
        val justNow: String,
        val chatCount: String,
        val likeCount: String,
        val commentCount: String,
        val empathyCount: String,
        val free: String,
        val won: String,
        val back: String,
        val searchIcon: String,
        val bellIcon: String,
        val clearIcon: String,
    )

    data class Notice(val title: String, val body: String, val ago: String)

    data class Notifications(
        val title: String,
        val markAllRead: String,
        val empty: String,
        val unread: String,
        val items: List<Notice>,
    )

    data class Search(
        val recentTitle: String,
        val clearRecent: String,
        /** `{n}` 자리 */
        val resultCount: String,
        /** 처음부터 들어 있는 최근 검색어 */
        val seeds: List<String>,
    )

    /**
     * 이벤트 화면 — **이 화면만 앱이 아니라 웹이다.**
     *
     * 여기 있는 것은 웹뷰를 감싼 네이티브 껍데기의 문구뿐이고, 웹 안의 글자는 서버가
     * 내주는 `web/webapp/copy.json` 에 따로 있다. 그게 이 구조의 목적이다 — 웹 쪽 문구를
     * 고치는 데 앱을 다시 배포하지 않는다 (저장소의 문의·내 계정 화면과 같은 판단).
     */
    data class Event(
        val bannerTitle: String,
        val bannerSub: String,
        val bannerCta: String,
        val menuLabel: String,
        val screenTitle: String,
        val loading: String,
        val loadError: String,
        val retry: String,
        val couponTitle: String,
        /** 숫자 자리가 {n} 이다 */
        val couponCount: String,
        val couponEmpty: String,
        val entryDone: String,
    )

    fun load(context: Context) {
        if (::app.isInitialized) return
        val root = JSONObject(context.assets.open("copy.json").bufferedReader().use { it.readText() })

        val a = root.getJSONObject("app")
        app = App(
            name = a.getString("name"),
            tagline = a.getString("tagline"),
            brandWord = a.getString("brandWord"),
            tempLabel = a.getString("tempLabel"),
            myTabLabel = a.getString("myTabLabel"),
        )
        tabs = root.getJSONArray("tabs").strings()

        val h = root.getJSONObject("home")
        home = Home(
            town = h.getString("town"),
            searchPlaceholder = h.getString("searchPlaceholder"),
            sellButton = h.getString("sellButton"),
            filterChips = h.getJSONArray("filterChips").strings(),
            townPickerTitle = h.getString("townPickerTitle"),
            townPickerHint = h.getString("townPickerHint"),
            townChanged = h.getString("townChanged"),
        )

        towns = root.getJSONArray("towns").objects().map { o ->
            Town(name = o.getString("name"), lat = o.getDouble("lat"), lng = o.getDouble("lng"))
        }

        items = root.getJSONArray("items").objects().mapIndexed { i, o ->
            Item(
                id = i,
                title = o.getString("title"),
                town = o.getString("town"),
                ago = o.getString("ago"),
                price = o.won("price"),
                desc = o.getString("desc"),
                likes = o.optInt("likes"),
                chatCount = o.optInt("chatCount"),
                sellerNick = o.getString("sellerNick"),
                sellerTemp = o.optString("sellerTemp", "36.5"),
                category = o.optString("category", ""),
                badge = o.optString("badge", ""),
            )
        }

        val bd = root.getJSONObject("badges")
        badges = Badges(reserved = bd.getString("reserved"), done = bd.getString("done"))

        val d = root.getJSONObject("detail")
        detail = Detail(
            sellerOtherLabel = d.getString("sellerOtherLabel"),
            likeLabel = d.getString("likeLabel"),
            chatButton = d.getString("chatButton"),
            tempCaption = d.getString("tempCaption"),
            reportLabel = d.getString("reportLabel"),
            reportReasons = d.getJSONArray("reportReasons").strings(),
            reportSubmit = d.getString("reportSubmit"),
            reportCancel = d.getString("reportCancel"),
            reportDone = d.getString("reportDone"),
            reportedLabel = d.getString("reportedLabel"),
            likedToast = d.getString("likedToast"),
            unlikedToast = d.getString("unlikedToast"),
            sellerScreenTitle = d.getString("sellerScreenTitle"),
            sellerItemsLabel = d.getString("sellerItemsLabel"),
            sellerNoItems = d.getString("sellerNoItems"),
        )

        community = root.getJSONArray("community").objects().map { o ->
            Post(
                tag = o.getString("tag"),
                title = o.getString("title"),
                body = o.getString("body"),
                nick = o.getString("nick"),
                town = o.getString("town"),
                ago = o.getString("ago"),
                comments = o.optInt("comments"),
                likes = o.optInt("likes"),
            )
        }

        val b = root.getJSONObject("board")
        board = Board(
            write = b.getString("write"),
            writeTitle = b.getString("writeTitle"),
            tagLabel = b.getString("tagLabel"),
            titlePlaceholder = b.getString("titlePlaceholder"),
            bodyPlaceholder = b.getString("bodyPlaceholder"),
            submit = b.getString("submit"),
            done = b.getString("done"),
            needTitle = b.getString("needTitle"),
            needBody = b.getString("needBody"),
            postScreenTitle = b.getString("postScreenTitle"),
            commentPlaceholder = b.getString("commentPlaceholder"),
            commentSend = b.getString("commentSend"),
            commentsLabel = b.getString("commentsLabel"),
            commentEmpty = b.getString("commentEmpty"),
            like = b.getString("like"),
            liked = b.getString("liked"),
            tagAll = b.getString("tagAll"),
            comments = b.getJSONArray("comments").arrays().map { list ->
                list.objects().map { o -> Comment(o.getString("nick"), o.getString("text"), o.getString("ago")) }
            },
        )

        val n = root.getJSONObject("nearby")
        nearby = Nearby(
            title = n.getString("title"),
            sub = n.getString("sub"),
            places = n.getJSONArray("places").objects().map { o ->
                Place(
                    name = o.getString("name"),
                    category = o.getString("category"),
                    town = o.getString("town"),
                    review = o.getString("review"),
                    stars = o.optInt("stars", 5),
                )
            },
            distanceChips = n.getJSONArray("distanceChips").strings(),
            placeScreenTitle = n.getString("placeScreenTitle"),
            favorite = n.getString("favorite"),
            favorited = n.getString("favorited"),
            reviewsLabel = n.getString("reviewsLabel"),
            reviewPlaceholder = n.getString("reviewPlaceholder"),
            reviewSubmit = n.getString("reviewSubmit"),
            reviewDone = n.getString("reviewDone"),
            extraReviews = n.getJSONArray("extraReviews").arrays().map { list ->
                list.objects().map { o -> Review(o.getString("nick"), o.getString("text")) }
            },
        )

        chatList = root.getJSONArray("chatList").objects().map { o ->
            ChatRoom(
                nick = o.getString("nick"),
                town = o.getString("town"),
                ago = o.getString("ago"),
                last = o.getString("last"),
                itemTitle = o.getString("itemTitle"),
                unread = o.optInt("unread"),
            )
        }

        val t = root.getJSONObject("chatThread")
        chatThread = ChatThread(
            peerNick = t.getString("peerNick"),
            itemTitle = t.getString("itemTitle"),
            inputPlaceholder = t.getString("inputPlaceholder"),
            quickReplies = t.getJSONArray("quickReplies").strings(),
            messages = t.getJSONArray("messages").objects().map { o ->
                Message(fromMe = o.getString("from") == "me", text = o.getString("text"))
            },
            sendButton = t.getString("sendButton"),
            newRoomHint = t.getString("newRoomHint"),
            autoReplies = t.getJSONArray("autoReplies").strings(),
        )

        val s = root.getJSONObject("sell")
        sell = Sell(
            title = s.getString("title"),
            photoHint = s.getString("photoHint"),
            titlePlaceholder = s.getString("titlePlaceholder"),
            pricePlaceholder = s.getString("pricePlaceholder"),
            freeCheck = s.getString("freeCheck"),
            descPlaceholder = s.getString("descPlaceholder"),
            submit = s.getString("submit"),
            doneToast = s.getString("doneToast"),
            categoryLabel = s.getString("categoryLabel"),
            photoCount = s.getString("photoCount"),
            needTitle = s.getString("needTitle"),
            needPrice = s.getString("needPrice"),
        )

        val p = root.getJSONObject("profile")
        profile = Profile(
            nick = p.getString("nick"),
            town = p.getString("town"),
            tempCaption = p.getString("tempCaption"),
            menu = p.getJSONArray("menu").strings(),
            sales = p.getString("sales"),
            purchases = p.getString("purchases"),
            likes = p.getString("likes"),
            verifiedBadge = p.getString("verifiedBadge"),
            emptySales = p.getString("emptySales"),
            emptyPurchases = p.getString("emptyPurchases"),
            salesItems = p.getJSONArray("salesItems").objects().map { o ->
                SaleItem(o.getString("title"), o.won("price"), o.getString("status"))
            },
            purchaseItems = p.getJSONArray("purchaseItems").objects().map { o ->
                PurchaseItem(o.getString("title"), o.won("price"), o.getString("seller"))
            },
            verifyBody = p.getString("verifyBody"),
            verifyButton = p.getString("verifyButton"),
            verifyDone = p.getString("verifyDone"),
            notifyItems = p.getJSONArray("notifyItems").strings(),
            on = p.getString("on"),
            off = p.getString("off"),
            categoryHint = p.getString("categoryHint"),
            categoryCount = p.getString("categoryCount"),
            reviews = p.getJSONArray("reviews").objects().map { o ->
                TradeReview(o.getString("nick"), o.getString("text"), o.getString("ago"))
            },
            faq = p.getJSONArray("faq").objects().map { o -> Faq(o.getString("q"), o.getString("a")) },
            faqLabel = p.getString("faqLabel"),
            inquiryLabel = p.getString("inquiryLabel"),
            inquiryPlaceholder = p.getString("inquiryPlaceholder"),
            inquirySubmit = p.getString("inquirySubmit"),
            inquiryDone = p.getString("inquiryDone"),
            needInquiry = p.getString("needInquiry"),
        )

        val e = root.getJSONObject("event")
        event = Event(
            bannerTitle = e.getString("bannerTitle"),
            bannerSub = e.getString("bannerSub"),
            bannerCta = e.getString("bannerCta"),
            menuLabel = e.getString("menuLabel"),
            screenTitle = e.getString("screenTitle"),
            loading = e.getString("loading"),
            loadError = e.getString("loadError"),
            retry = e.getString("retry"),
            couponTitle = e.getString("couponTitle"),
            couponCount = e.getString("couponCount"),
            couponEmpty = e.getString("couponEmpty"),
            entryDone = e.getString("entryDone"),
        )

        val m = root.getJSONObject("misc")
        misc = Misc(
            emptyChat = m.getString("emptyChat"),
            emptyLikes = m.getString("emptyLikes"),
            searchEmpty = m.getString("searchEmpty"),
            justNow = m.getString("justNow"),
            chatCount = m.getString("chatCount"),
            likeCount = m.getString("likeCount"),
            commentCount = m.getString("commentCount"),
            empathyCount = m.getString("empathyCount"),
            free = m.getString("free"),
            won = m.getString("won"),
            back = m.getString("back"),
            searchIcon = m.getString("searchIcon"),
            bellIcon = m.getString("bellIcon"),
            clearIcon = m.getString("clearIcon"),
        )

        val no = root.getJSONObject("notifications")
        notifications = Notifications(
            title = no.getString("title"),
            markAllRead = no.getString("markAllRead"),
            empty = no.getString("empty"),
            unread = no.getString("unread"),
            items = no.getJSONArray("items").objects().map { o ->
                Notice(o.getString("title"), o.getString("body"), o.getString("ago"))
            },
        )

        val se = root.getJSONObject("search")
        search = Search(
            recentTitle = se.getString("recentTitle"),
            clearRecent = se.getString("clearRecent"),
            resultCount = se.getString("resultCount"),
            seeds = se.getJSONArray("seeds").strings(),
        )
    }

    private fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }
    private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
    private fun JSONArray.arrays(): List<JSONArray> = (0 until length()).map { getJSONArray(it) }

    /** 가격은 문자열로 올 수도 숫자로 올 수도 있다. 둘 다 받는다 */
    private fun JSONObject.won(key: String): Int = optString(key, "0").filter { it.isDigit() }.toIntOrNull() ?: 0
}

/** `"채팅 {n}"` 에 숫자를, `"{town}으로 바꿨어요"` 에 동네를 끼운다 */
fun String.fill(vararg pairs: Pair<String, Any>): String =
    pairs.fold(this) { acc, (key, value) -> acc.replace("{$key}", value.toString()) }

/** 38000 → "38,000원", 0 → "나눔". 가격을 찍는 자리가 여럿이라 한 곳에 둔다 */
fun formatPrice(won: Int): String {
    if (won <= 0) return Copy.misc.free
    val digits = won.toString().reversed().chunked(3).joinToString(",").reversed()
    return Copy.misc.won.fill("n" to digits)
}
