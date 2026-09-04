// 이 데모에서 AI 가 하는 일은 둘뿐이다.
//
//   1. **말 → 시나리오.** "홈에서 첫 상품 열고 채팅 눌러줘" 를 Maestro yaml 로 옮긴다
//   2. **실패 → 원인.** 떨어진 로그와 그때 화면에 있던 글자를 보고 왜 실패했는지 적는다
//
// 둘 다 사람이 기다리는 자리지만 **통화처럼 급하지는 않다**(AICC 는 수화기를 든 사람이
// 기다려서 Groq 로 갈랐다). 여기서는 저장소 규칙 그대로 OpenRouter 하나만 쓴다
// (docs/rules.md §LLM 추론 — 제공자 SDK 를 직접 물지 않는다).
//
// **추론은 끈다.** deepseek-v4-flash 는 추론 모델이라 켜 두면 생각을 다 만든 뒤에야
// 답이 나오고, 더 나쁜 것은 같은 JSON 을 두 번 이어 붙여 내놓는 판이 있다는 것이다
// (AICC 에서 실제로 밟았다 — 그러면 JSON.parse 가 통째로 실패한다).
//
// 키가 없으면 이 두 기능만 조용히 꺼진다. 화면이 "키 없음"이라고 밝히고, 나머지(원격
// 조작·저장된 시나리오 실행)는 그대로 돈다.

import { APP_ID } from './device.ts'

const KEY = process.env.AIQA_OPENROUTER_API_KEY ?? ''
const BASE = process.env.AIQA_OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
const MODEL = process.env.AIQA_LLM_MODEL ?? 'deepseek/deepseek-v4-flash'

export function enabled() {
    return KEY.length > 0
}

export class LlmError extends Error {}

async function chat(system: string, user: string, timeoutMs: number): Promise<string> {
    if (!KEY) throw new LlmError('OpenRouter 키가 없어요')
    const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${KEY}`,
            'content-type': 'application/json',
            // 대시보드에서 어느 데모가 쓴 건지 갈라 보려고 붙인다
            'http-referer': 'https://qa.example/aiqa/',
            'x-title': 'AI QA demo',
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            temperature: 0.2,
            reasoning: { enabled: false },
        }),
        signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new LlmError(`OpenRouter ${res.status} ${detail.slice(0, 300)}`)
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = body.choices?.[0]?.message?.content ?? ''
    if (!text.trim()) throw new LlmError('빈 답이 왔어요')
    return text
}

// ── 말 → 시나리오 ─────────────────────────────────────────────────────────────

/**
 * Maestro 문법을 통째로 알려 주지 않는다. **우리가 쓰는 명령만** 적어 준다 —
 * 모델이 아는 척하고 넣은 명령이 문법 오류로 떨어지는 것보다, 좁은 어휘로 확실히
 * 도는 편이 데모에서 낫다.
 */
const FLOW_SYSTEM = `너는 Maestro(mobile.dev) 시나리오를 쓰는 도구다.
사용자가 한국어로 시키는 조작을 Maestro yaml 로 옮긴다.

규칙:
- 출력은 yaml 본문 **하나뿐**이다. 설명·마크다운 코드펜스·주석을 붙이지 마라.
- 첫 블록은 반드시 다음 두 줄과 --- 로 시작한다:
appId: ${APP_ID}
---
- 그 다음 첫 명령은 늘 "- launchApp" 이다.
- 쓸 수 있는 명령은 아래뿐이다. 다른 명령을 지어내지 마라.
  - launchApp
  - launchApp:
      clearState: true
  - tapOn: "화면에 보이는 글자"
  - tapOn:
      id: "리소스 아이디"
  - tapOn:
      point: "50%,80%"
  - longPressOn: "글자"
  - inputText: "넣을 글자"
  - eraseText
  - pressKey: Enter        (Back, Home 도 된다)
  - back
  - scroll
  - scrollUntilVisible:
      element:
        text: "글자"
  - swipe:
      direction: UP        (DOWN, LEFT, RIGHT)
  - assertVisible: "보여야 하는 글자"
  - assertNotVisible: "안 보여야 하는 글자"
  - waitForAnimationToEnd
  - takeScreenshot: 이름
- 글자로 찾을 때는 **화면에 실제로 있는 말**을 써라. 아래 "앱에 있는 말" 목록에서 고른다.
- **글자는 부분 일치가 아니다.** 요소의 글자와 **똑같거나**, 정규식으로 **통째로** 맞아야 한다.
  목록에 있는 말을 그대로 쓰면 되고, 일부만 쓰고 싶으면 ".*골목온도.*" 처럼 감싼다.
- 단계는 12개를 넘기지 마라. 마지막은 되도록 assertVisible 로 끝낸다.`

export async function toFlow(instruction: string, appWords: string[]): Promise<string> {
    const user = [
        `시킬 일: ${instruction}`,
        '',
        '앱에 있는 말 (이 중에서 고른다):',
        appWords.slice(0, 80).join(' · '),
    ].join('\n')
    const raw = await chat(FLOW_SYSTEM, user, 60_000)
    return cleanYaml(raw)
}

/**
 * 모델이 코드펜스를 붙이는 판이 잦다. 붙었으면 벗기고, 안 붙었으면 그대로 둔다.
 * (프롬프트로 막아도 새는 자리라 받는 쪽에서 한 번 더 본다)
 */
function cleanYaml(raw: string): string {
    let text = raw.trim()
    const fence = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
    if (fence) text = fence[1]
    return text.trim() + '\n'
}

// ── 실패 → 원인 ───────────────────────────────────────────────────────────────

const DIAGNOSE_SYSTEM = `너는 모바일 QA 엔지니어다.
Maestro 시나리오가 실패했다. 로그와 실패 순간 화면에 있던 글자를 보고 원인을 짚는다.

규칙:
- 한국어 해요체. 세 문단을 넘기지 마라.
- 형식은 이렇게 한다:
  **어디서** — 어느 단계에서 멈췄는지 한 줄
  **왜** — 로그와 화면 글자가 가리키는 원인 한두 줄
  **다음** — 무엇을 고치거나 확인하면 되는지 한 줄
- 근거에 없는 것을 지어내지 마라. 모르면 "로그만으로는 알 수 없어요"라고 적는다.
- 코드 블록을 넣지 마라.`

export async function diagnose(e: {
    flowName: string
    yaml: string
    log: string[]
    activity: string
    texts: string[]
}): Promise<string> {
    const user = [
        `시나리오: ${e.flowName}`,
        '',
        '--- 시나리오 yaml ---',
        e.yaml.slice(0, 2000),
        '',
        '--- 실행 로그 (끝부분) ---',
        e.log.join('\n').slice(-4000),
        '',
        `--- 실패 순간 화면 ---`,
        `앞에 있던 화면: ${e.activity || '알 수 없음'}`,
        `보이던 글자: ${e.texts.join(' · ').slice(0, 1500)}`,
    ].join('\n')
    return chat(DIAGNOSE_SYSTEM, user, 60_000)
}
