package com.example.demo.qaime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.util.Base64
import android.util.Log
import android.view.View

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
                    setResultCode(1)
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
     */
    override fun onCreateInputView(): View = View(this).apply {
        minimumHeight = 1
    }

    /** 자판 자리를 화면에서 완전히 빼앗지 않게 한다 */
    override fun onEvaluateFullscreenMode(): Boolean = false
}
