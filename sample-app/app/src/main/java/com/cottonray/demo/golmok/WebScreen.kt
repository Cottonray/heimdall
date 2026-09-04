package com.example.demo.golmok

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject

/**
 * 웹으로 뺀 화면의 주소.
 *
 * `10.0.2.2` 는 **에뮬레이터에서 본 호스트의 루프백**이다. 이 앱이 도는 에뮬레이터와
 * 그 웹앱을 내주는 서버가 같은 컨테이너에 있어서, 이 주소가 곧 우리 서버(:8080)다.
 * 진짜 서비스라면 여기가 `https://example.invalid/...` 자리다.
 */
const val EVENT_URL = "http://10.0.2.2:8080/aiqa/webapp/"

/**
 * **이 화면만 앱이 아니라 웹이다.**
 *
 * 껍데기는 네이티브(상단바·로딩·오류)이고 안은 우리 서버가 내주는 웹앱이다. 저장소가
 * 문의·내 계정 화면을 그렇게 두는 것과 같은 구조다 — 그 화면의 문구를 고치는 데 앱 배포가
 * 끼지 않게 하려는 것 (docs/support.md · docs/account.md).
 *
 * **QA 관점에서 이 화면이 있는 이유**: 웹 구간에 들어서면 화면의 것들이 안드로이드 뷰가
 * 아니다. 접근성 트리에 글자로만 올라오고 `resource-id` 가 없어서, 시나리오가 `id:` 로
 * 집던 것을 갑자기 글자로 집어야 한다. 네이티브와 웹이 섞인 앱에서 테스트가 실제로 어디서
 * 걸리는지를 보여 주는 자리다.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebScreen(
    modifier: Modifier,
    url: String,
    onBack: () -> Unit,
    onCoupon: (Int) -> Unit,
    onEntry: (String, String) -> Unit,
) {
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    // 껍데기가 웹뷰를 다시 부르는 유일한 손잡이. 숫자가 바뀌면 AndroidView 가 다시 로드한다
    var attempt by remember { mutableStateOf(0) }

    Column(modifier.fillMaxSize()) {
        TopBar(Copy.event.screenTitle, onBack)

        Box(Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize().testTag("event_web"),
                factory = { context ->
                    WebView(context).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        // 링크를 눌러도 바깥 브라우저로 나가지 않게 한다. 주소 막대가 보이면
                        // 사용자는 앱 밖으로 나간 것으로 읽는다 (저장소의 웹뷰 규약과 같다)
                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                loading = true
                                failed = false
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                loading = false
                            }

                            override fun onReceivedError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                error: WebResourceError?,
                            ) {
                                // 하위 자원(파비콘 등) 실패로 화면 전체를 오류로 만들지 않는다
                                if (request?.isForMainFrame == true) {
                                    loading = false
                                    failed = true
                                }
                            }
                        }
                        addJavascriptInterface(Bridge(onCoupon, onEntry, onBack), "Golmok")
                        loadUrl(url)
                    }
                },
                update = { view ->
                    if (attempt > 0 && failed) {
                        failed = false
                        view.loadUrl(url)
                    }
                },
            )

            if (loading) {
                Text(
                    Copy.event.loading,
                    color = Sub,
                    modifier = Modifier.align(Alignment.Center).testTag("web_loading"),
                )
            }

            if (failed) {
                Column(
                    Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(Copy.event.loadError, color = Sub)
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = { attempt += 1 },
                        colors = ButtonDefaults.buttonColors(containerColor = Brand),
                        modifier = Modifier.testTag("web_retry"),
                    ) { Text(Copy.event.retry) }
                }
            }
        }
    }
}

/**
 * 웹 → 앱 다리.
 *
 * **자바스크립트가 부르는 자리라 메인 스레드가 아니다.** Compose 상태를 여기서 바로
 * 건드리면 스레드 위반으로 조용히 깨진다 — 반드시 메인으로 넘긴다.
 */
private class Bridge(
    private val onCoupon: (Int) -> Unit,
    private val onEntry: (String, String) -> Unit,
    private val onClose: () -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun postMessage(raw: String) {
        val json = runCatching { JSONObject(raw) }.getOrNull() ?: return
        when (json.optString("type")) {
            "coupon" -> main.post { onCoupon(json.optInt("count")) }
            "entry" -> main.post { onEntry(json.optString("nick"), json.optString("wish")) }
            "close" -> main.post { onClose() }
        }
    }
}

/** 홈 목록 위에 붙는 이벤트 배너 — **웹 화면으로 들어가는 입구다** */
@Composable
fun EventBanner(onOpen: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("event_banner"),
    ) {
        Text(Copy.event.bannerTitle, style = MaterialTheme.typography.titleMedium)
        Text(Copy.event.bannerSub, style = MaterialTheme.typography.bodyMedium, color = Sub)
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = onOpen,
            colors = ButtonDefaults.buttonColors(containerColor = Brand),
            modifier = Modifier.testTag("event_open"),
        ) { Text(Copy.event.bannerCta, fontWeight = FontWeight.Bold) }
    }
}
