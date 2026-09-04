package com.example.demo.qaime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.inputmethodservice.InputMethodService
import android.inputmethodservice.InputMethodService.Insets
import android.os.Build
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.ViewGroup

/**
 * 방송을 받아 글자를 넣어 주는 키보드.
 *
 * `adb shell input text` 는 **아스키만 넣는다** — 한글은 KeyCharacterMap 에 없어 키
 * 이벤트로 바뀌지 못하고 조용히 사라진다. 그래서 adb 갈래는 글자를 여기로 보낸다:
 *
 *     adb shell am broadcast -a com.example.demo.qaime.TEXT --es b64 <base64>
 *
 * **base64 로 받는 이유**: 지나가는 길에 셸이 둘 있다(우리 셸, 기기 셸). 원문을 그대로
 * 실으면 따옴표·`$`·공백을 그 둘이 먼저 해석한다. base64 는 `A-Za-z0-9+/=` 뿐이라
 * 아무도 손대지 않는다.
 *
 * 화면을 그리지 않는다(1px). 자판이 올라오면 그만큼 앱 화면을 가려서, 스크린샷에
 * 찍히는 것도 시나리오가 누르는 자리도 달라진다.
 */
class QaKeyboard : InputMethodService() {

    companion object {
        private const val TAG = "QaKeyboard"

        /** 글자 넣기. `--es b64 <base64 of UTF-8>` */
        const val ACTION_TEXT = "com.example.demo.qaime.TEXT"

        /** 앞의 글자 지우기. `--ei n <개수>` (없으면 전부) */
        const val ACTION_CLEAR = "com.example.demo.qaime.CLEAR"
    }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            // **결과 코드로 성공을 알린다.** `am broadcast` 가 "Broadcast completed:
            // result=N" 으로 그 값을 찍어 주므로, 부르는 쪽이 들어갔는지 안 들어갔는지
            // 알 수 있다. 이게 없으면 입력칸에 아직 안 붙은 순간에 보낸 글자가 조용히
            // 사라지고, 두 화면 뒤에서야 "왜 검색이 비었지"로 나타난다.
            setResultCode(0)

            val ic = currentInputConnection ?: run {
                Log.w(TAG, "no input connection")
                return
            }
            when (intent.action) {
                ACTION_TEXT -> {
                    val b64 = intent.getStringExtra("b64") ?: return
                    val text = runCatching {
                        String(Base64.decode(b64, Base64.DEFAULT), Charsets.UTF_8)
                    }.getOrElse {
                        Log.w(TAG, "bad base64", it)
                        return
                    }
                    ic.commitText(text, 1)
                    // **넣었다고 바로 성공이라 하지 않는다.** 붙은 입력칸이 없을 때도
                    // 시스템은 살아 있는 척하는 대체 연결(fallback)을 내주는데, 거기에
                    // commitText 를 하면 아무 데도 안 가면서 예외도 안 난다.
                    // 실제로 탭 직후 26ms 만에 보낸 글자가 그렇게 사라졌다.
                    // 방금 넣은 글자를 되읽어 보는 것이 유일하게 확실한 확인이다.
                    val back = ic.getTextBeforeCursor(text.length, 0)?.toString()
                    setResultCode(if (back != null && back.endsWith(text)) 1 else 0)
                }

                ACTION_CLEAR -> {
                    val n = intent.getIntExtra("n", 0)
                    // 0 이면 넉넉히 지운다. 이 앱의 입력칸은 한 줄짜리라 이 정도면 충분하다
                    ic.deleteSurroundingText(if (n > 0) n else 500, 0)
                    setResultCode(1)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        val filter = IntentFilter().apply {
            addAction(ACTION_TEXT)
            addAction(ACTION_CLEAR)
        }
        // API 33 부터 등록할 때 내보낼지를 반드시 밝혀야 한다. 밝히지 않으면 예외로 죽는다.
        // 이 방송은 adb 가 보낸다 — 그러니 EXPORTED 다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(receiver, filter)
        }
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(receiver) }
        super.onDestroy()
    }

    /**
     * 자판을 그리지 않는다. `null` 을 돌려주면 시스템이 이 IME 를 "입력창이 없는 것"으로
     * 보고 어떤 판에서는 아예 붙이지 않는다 — 그래서 1px 짜리 빈 뷰를 준다.
     *
     * **높이를 LayoutParams 로 못박아야 한다.** `minimumHeight = 1` 만 주면 뷰의 기본
     * 레이아웃이 MATCH_PARENT 라 자판 창이 화면 전체를 덮는다. 그 창은 투명해서 눈에는
     * 아무것도 안 보이지만 **터치를 전부 먹는다** — 첫 입력칸을 누른 뒤로는 어떤 탭도
     * 앱에 닿지 않는다. 실제로 이것 때문에 "가격칸을 눌러도 포커스가 안 옮겨가서" 제목에
     * 가격이 이어 붙었고(`접이식 캠핑 의자15000`), 두 갈래 모두 등록 시나리오가 떨어졌다.
     * `dumpsys window windows` 의 InputMethod 창 frame 이 [0,136][720,1600] 이면 그 상태다.
     */
    override fun onCreateInputView(): View = View(this).apply {
        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1)
    }

    /**
     * **터치를 하나도 받지 않는다.**
     *
     * 자판 창은 원래 화면 전체 크기다(`dumpsys window` 로 보면 [0,136][720,1600]). 보통은
     * 그 중 자판이 그려진 부분만 터치를 받는데, 그 범위를 시스템이 우리가 알려 준 대로
     * 잡는다. 아무것도 안 알려 주면 **창 전체가 터치를 먹는다** — 눈에는 아무것도 안
     * 보이는데 첫 입력칸을 누른 뒤로 모든 탭이 앱에 닿지 않는다.
     *
     * 실제로 이것 때문에 가격칸을 눌러도 포커스가 안 옮겨가서 제목에 가격이 이어 붙었고
     * (`접이식 캠핑 의자15000`), 등록 시나리오가 **두 갈래 모두** 떨어졌다. 뷰 높이를
     * 1px 로 줄이는 것만으로는 안 된다 — 창 크기와 터치 범위는 다른 값이다.
     *
     * 이 키보드는 방송으로만 글자를 넣으므로 손가락이 닿을 자리가 필요 없다.
     */
    override fun onComputeInsets(outInsets: Insets) {
        super.onComputeInsets(outInsets)
        outInsets.touchableInsets = Insets.TOUCHABLE_INSETS_REGION
        outInsets.touchableRegion.setEmpty()
        // 앱 화면을 밀어 올리지도 않는다 — 자판이 없으니 비켜 줄 자리도 없다
        val height = window?.window?.decorView?.height ?: 0
        outInsets.contentTopInsets = height
        outInsets.visibleTopInsets = height
    }

    /** 자판 자리를 화면에서 완전히 빼앗지 않게 한다 */
    override fun onEvaluateFullscreenMode(): Boolean = false
}
