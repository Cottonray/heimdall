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
 */
object Copy {
    lateinit var app: App private set
    lateinit var tabs: List<String> private set
    lateinit var home: Home private set
    lateinit var items: List<Item> private set
    lateinit var detail: Detail private set
    lateinit var community: List<Post> private set
    lateinit var nearby: Nearby private set
    lateinit var chatList: List<ChatRoom> private set
    lateinit var chatThread: ChatThread private set
    lateinit var sell: Sell private set
    lateinit var profile: Profile private set
    lateinit var misc: Misc private set
    lateinit var event: Event private set

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
    )

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

    data class Detail(
        val sellerOtherLabel: String,
        val likeLabel: String,
        val chatButton: String,
        val tempCaption: String,
        val reportLabel: String,
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

    data class Place(
        val name: String,
        val category: String,
        val town: String,
        val review: String,
        val stars: Int,
    )

    data class Nearby(val title: String, val sub: String, val places: List<Place>)

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
    )

    data class Profile(
        val nick: String,
        val town: String,
        val tempCaption: String,
        val menu: List<String>,
        val sales: String,
        val purchases: String,
        val likes: String,
    )

    data class Misc(
        val emptyChat: String,
        val emptyLikes: String,
        val searchEmpty: String,
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
        )

        items = root.getJSONArray("items").objects().mapIndexed { i, o ->
            Item(
                id = i,
                title = o.getString("title"),
                town = o.getString("town"),
                ago = o.getString("ago"),
                // 가격은 문자열로 올 수도 숫자로 올 수도 있다. 둘 다 받는다
                price = o.optString("price", "0").filter { it.isDigit() }.toIntOrNull() ?: 0,
                desc = o.getString("desc"),
                likes = o.optInt("likes"),
                chatCount = o.optInt("chatCount"),
                sellerNick = o.getString("sellerNick"),
                sellerTemp = o.optString("sellerTemp", "36.5"),
                category = o.optString("category", ""),
                badge = o.optString("badge", ""),
            )
        }

        val d = root.getJSONObject("detail")
        detail = Detail(
            sellerOtherLabel = d.getString("sellerOtherLabel"),
            likeLabel = d.getString("likeLabel"),
            chatButton = d.getString("chatButton"),
            tempCaption = d.getString("tempCaption"),
            reportLabel = d.getString("reportLabel"),
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
        )
    }

    private fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }
    private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
}

/** 38000 → "38,000원", 0 → "나눔". 가격을 찍는 자리가 여럿이라 한 곳에 둔다 */
fun formatPrice(won: Int): String {
    if (won <= 0) return "나눔"
    val digits = won.toString().reversed().chunked(3).joinToString(",").reversed()
    return "${digits}원"
}
