// 이 데모에서 AI 가 하는 일은 둘이다.
//
//   1. **대화 → 시나리오.** "검색이 되는지 보고 싶어요" 에서 시작해 되묻고, 정해지면
//      Maestro yaml 을 낸다 (`design`)
//   2. **실패 → 원인.** 떨어진 로그와 그때 화면에 있던 글자를 보고 왜 실패했는지 적는다
//
// **한 방에 만들지 않고 되묻는 이유.** 처음에는 입력칸 하나에 시킬 일을 적으면 yaml 이
// 나오는 자리였는데, QA 를 짜는 일은 원래 그렇게 생기지 않았다 — "검색을 보고 싶다"는 말
// 하나에는 *무엇으로 검색하나 · 결과만 보나 상세까지 들어가나 · 지운 뒤 다시 보나* 가
// 전부 빠져 있다. 그 빈칸을 모델이 혼자 메우면 사람이 원한 것과 다른 시나리오가
// 그럴듯하게 나오고, 다른 데서 틀린 것을 yaml 을 읽어 찾아내야 한다. 되물으면 그 빈칸이
// **선택지 두세 개로 화면에 보인다.**
//
// 둘 다 사람이 기다리는 자리지만 **통화처럼 급하지는 않다**(AICC 는 수화기를 든 사람이
// 기다려서 Groq 로 갈랐다). 여기서는 저장소 규칙 그대로 OpenRouter 하나만 쓴다
// (docs/rules.md §LLM 추론 — 제공자 SDK 를 직접 물지 않는다).
//
// **추론은 끈다.** deepseek-v4-flash 는 추론 모델이라 켜 두면 생각을 다 만든 뒤에야
// 답이 나오고, 더 나쁜 것은 같은 답을 두 번 이어 붙여 내놓는 판이 있다는 것이다
// (AICC 에서 실제로 밟았다).
//
// 키가 없으면 이 두 기능만 조용히 꺼진다. 화면이 "키 없음"이라고 밝히고, 나머지(원격
// 조작·저장된 시나리오 실행·편집기)는 그대로 돈다.

import { APP_ID } from './device.ts'
import { appIdOf, FlowParseError, parse as parseFlow } from './flows.ts'

const KEY = process.env.AIQA_OPENROUTER_API_KEY ?? ''
const BASE = process.env.AIQA_OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
const MODEL = process.env.AIQA_LLM_MODEL ?? 'deepseek/deepseek-v4-flash'

export function enabled() {
    return KEY.length > 0
}

export class LlmError extends Error {}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

async function complete(messages: Msg[], timeoutMs: number): Promise<string> {
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
            messages,
            temperature: 0.3,
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

// ── 대화 → 시나리오 ───────────────────────────────────────────────────────────

/**
 * Maestro 문법을 통째로 알려 주지 않는다. **우리가 쓰는 명령만** 적어 준다 —
 * 모델이 아는 척하고 넣은 명령은 세 갈래 중 adb·Appium 에서 그대로 거절당한다
 * (flows.ts 는 모르는 명령을 만나면 조용히 넘기지 않고 오류로 세운다).
 */
const COMMANDS = `쓸 수 있는 명령은 아래뿐이다. 다른 명령을 지어내지 마라.
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
  ※ inputText·eraseText 는 **지금 포커스가 가 있는 입력칸**에 들어간다. 바로 앞에서 그
     칸을 tapOn 으로 눌러 두지 않으면 "요소를 못 찾았다"로 떨어진다. 칸이 보이는지
     assertVisible 로 확인한 것은 누른 것이 아니다.
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
  - waitForAnimationToEnd`

/**
 * 답을 **JSON 으로 받지 않는다.**
 *
 * 낼 것 안에 yaml 이 통째로 들어 있는데, JSON 문자열은 줄바꿈을 `\\n` 으로 적어야 한다.
 * 모델은 여기서 자주 실수하고(문자열 안에 진짜 줄바꿈을 그대로 넣는다), 한 번 어긋나면
 * `JSON.parse` 가 통째로 실패해 **말도 시나리오도 둘 다 사라진다.** 줄 머리표는 그런
 * 자리가 없다 — 못 알아들은 줄은 그 줄만 버리면 된다.
 */
const DESIGN_SYSTEM = `너는 모바일 QA 시나리오를 **사용자와 같이 짜 주는** 설계자다.
사용자는 QA 를 잘 모를 수도 있다. 무엇을 확인하고 싶은지부터 같이 정한다.

답은 늘 아래 세 줄머리로만 적는다. 다른 글자를 앞뒤에 붙이지 마라.

SAY: 사용자에게 할 말 (한국어 해요체, 두 문장 안쪽)
ASK: 선택지 | 선택지 | 선택지
FLOW:
<Maestro yaml 본문>

- SAY 와 ASK 는 **늘 있다.** 둘 중 하나라도 빼면 안 된다.
- ASK 는 사용자가 눌러서 답할 수 있는 보기다. 2~4개, 하나에 12자 안쪽.
  **보기는 물음이 아니라 답이다.** 물음표를 넣지 마라 — 화면에서 단추 글자가 된다.
  ("검색어를 바꿔볼까요?" 가 아니라 "다른 검색어로")
  "직접 입력" 같은 보기는 넣지 마라 — 화면에 입력칸이 늘 열려 있다.
- FLOW 는 시나리오가 정해졌을 때만 넣는다. 아직 물어볼 게 있으면 줄을 통째로 뺀다.
  FLOW 는 늘 답의 마지막이고, 그 아래는 전부 yaml 이다. 코드펜스를 치지 마라.
- **SAY 에서 "짤게요 · 만들게요" 라고 말했으면 그 답에 FLOW 를 반드시 같이 넣어라.**
  다음 차례로 미루지 마라. 아직 안 만들 거면 SAY 에서 만들겠다고 말하지 마라 —
  화면에는 만들겠다는 말만 뜨고 시나리오는 없는 꼴이 된다.

대화 규칙:
- **묻는 것이 먼저다.** 사용자가 ① 어느 화면에서 ② 무엇이 맞는지 확인할지를 **둘 다**
  말하지 않았으면 FLOW 를 내지 말고 ASK 만 낸다. "상품 검색" · "채팅" 같은 말은 화면
  이름일 뿐 무엇을 확인할지가 없다 — 그런 답에는 반드시 되묻는다.
- **한 번에 하나만 묻는다.** 두 가지를 한꺼번에 물으면 어느 쪽 답인지 알 수 없게 된다.
- 되묻는 것은 한두 번이면 충분하다. 안 정해진 것은 그럴듯한 값으로 정하고 SAY 에 밝힌다.
- FLOW 를 낸 뒤에도 ASK 는 있다. 그때는 **방금 낸 그 시나리오를 고치는 보기**다
  (검증을 더 넣을지 · 다른 값으로 해 볼지 · 뒤를 더 이어갈지). 위에 든 예시 문구를
  그대로 베끼지 말고 지금 시나리오에 맞는 말을 지어라. 실행 단추는 화면이 따로 그려
  주니 "실행할까요" 는 묻지 마라.

시나리오 규칙:
- 첫 줄은 "appId: ${APP_ID}" 이고 그다음 줄이 "---" 다. 그 뒤 첫 명령은 늘 launchApp 이다.
- ${COMMANDS}
- 글자로 찾을 때는 **앱에 실제로 있는 말**을 써라. 아래에 준 목록에서 고른다.
- **글자는 부분 일치가 아니다.** 요소의 글자와 **똑같거나**, 정규식으로 **통째로** 맞아야 한다.
  목록에 있는 말을 그대로 쓰면 되고, 일부만 쓰고 싶으면 ".*골목온도.*" 처럼 감싼다.
- 단계는 12개를 넘기지 마라. 마지막은 되도록 assertVisible 로 끝낸다.`

export type Turn = { role: 'user' | 'assistant'; text: string; yaml?: string }

export type Context = {
    /** 지금 폰 화면에 실제로 있는 글자 */
    screen: string[]
    /** 저장된 시나리오가 실제로 집는 선택자 — 이미 통과해 본 것들이라 믿을 수 있다 */
    known: { texts: string[]; ids: string[] }
    /** 저장된 시나리오 목록. 앱에 어떤 흐름이 있는지 알려 주는 지도다 */
    flows: { name: string; desc: string }[]
    /** 예시 한 벌 (주석을 뗀 저장된 시나리오) */
    example: string
}

export type Design = {
    say: string
    choices: string[]
    yaml: string | null
    /** 사람에게 그대로 보여 줄 곁말. 만든 것을 버렸을 때만 채운다 */
    note: string | null
}

export async function design(turns: Turn[], ctx: Context): Promise<Design> {
    const messages: Msg[] = [
        { role: 'system', content: `${DESIGN_SYSTEM}\n\n${brief(turns, ctx)}` },
        ...turns.map((t) => ({
            role: t.role,
            content: t.yaml ? `${t.text}\n\nFLOW:\n${t.yaml}` : t.text,
        })),
    ]

    let raw = await complete(messages, 60_000)
    let out = readReply(raw)
    if (!out.yaml) return out

    // **우리 실행기가 못 읽는 시나리오는 내주지 않는다.** 화면에 넣어 줘 봐야 [실행] 을
    // 누르는 순간 문법 오류로 떨어지는데, 그때는 사람이 yaml 을 읽어 고쳐야 한다.
    // 모델에게 거절 사유를 그대로 돌려주면 대개 한 번에 고친다.
    const bad = check(out.yaml)
    if (!bad) return out

    messages.push({ role: 'assistant', content: raw })
    messages.push({
        role: 'user',
        content: `방금 낸 시나리오를 실행기가 거절했어요: ${bad}\n같은 줄머리 형식으로 고쳐서 다시 내주세요.`,
    })
    raw = await complete(messages, 60_000)
    const retry = readReply(raw)
    if (retry.yaml && !check(retry.yaml)) return retry
    return { ...retry, yaml: null, note: `만든 시나리오가 실행기 문법에 맞지 않아 뺐어요 (${bad})` }
}

/** 앱 사정을 한 덩이로 적는다. 앱을 말로 설명하지 않고 **저장소에 있는 것에서 뽑는다** */
function brief(turns: Turn[], ctx: Context): string {
    const answered = turns.filter((t) => t.role === 'user').length
    const lines = [
        '## 지금 사정',
        `테스트 대상 앱: ${APP_ID}`,
        '',
        '이 앱에 이미 있는 시나리오 (어떤 흐름이 있는지 알려 주는 지도다):',
        ...ctx.flows.map((f) => `- ${f.name} — ${f.desc}`),
        '',
        '저장된 시나리오가 실제로 집는 말 (통과해 본 것들이다):',
        ctx.known.texts.slice(0, 60).join(' · '),
        '',
        '저장된 시나리오가 실제로 집는 아이디:',
        ctx.known.ids.slice(0, 40).join(' · '),
    ]
    if (ctx.screen.length > 0) {
        lines.push('', '지금 폰 화면에 보이는 말:', ctx.screen.slice(0, 50).join(' · '))
    }
    if (ctx.example) {
        lines.push('', '시나리오 한 벌은 이렇게 생겼다:', ctx.example)
    }
    // **몇 번째 답인지를 프롬프트가 안다.** 모델이 스스로 "이쯤 됐다"를 세게 두면 어떤
    // 판은 첫 마디에 시나리오를 뱉고 어떤 판은 다섯 번을 되묻는다 — 둘 다 나쁘다
    lines.push('', `사용자는 지금까지 ${answered}번 답했다.`)
    if (answered >= 3) {
        lines.push('**이번에는 반드시 FLOW 를 내라.** 안 정해진 것은 네가 정하고 SAY 에 밝힌다.')
    } else if (answered <= 1) {
        lines.push(
            '아직 첫 마디다. 사용자가 **어느 화면에서 무엇이 맞는지 확인할지** 둘 다 말하지',
            '않았으면 **FLOW 를 내지 말고 ASK 만 내라.** 보기는 이 앱에서 실제로 갈리는',
            '것이어야 한다 (예: 결과 목록까지만 볼지 · 상세까지 들어갈지).',
        )
    } else {
        lines.push('아직 모호한 것이 있으면 ASK 로 한 번 더 묻는다. 정해졌으면 FLOW 를 낸다.')
    }
    return lines.join('\n')
}

/**
 * 줄머리를 읽는다. 모르는 줄은 그 줄만 버린다 — 답을 통째로 잃는 것보다 낫다.
 * 줄머리가 하나도 없으면 모델이 형식을 통째로 무시한 것이라, 있는 대로 건져 쓴다.
 */
function readReply(raw: string): Design {
    const text = stripFence(raw).trim()
    let say = ''
    let choices: string[] = []
    const yaml: string[] = []
    let mode: 'say' | 'flow' | null = null
    let marked = false

    for (const line of text.split('\n')) {
        const m = mode === 'flow' ? null : line.match(/^\s*(SAY|ASK|FLOW)\s*:\s*(.*)$/)
        if (m) {
            marked = true
            if (m[1] === 'SAY') {
                mode = 'say'
                say = m[2].trim()
            } else if (m[1] === 'ASK') {
                mode = null
                choices = m[2]
                    .split('|')
                    .map((c) => c.trim().replace(/^[-•]\s*/, ''))
                    .filter(Boolean)
                    .slice(0, 4)
            } else {
                // FLOW 아래는 전부 yaml 이다. 여기부터는 줄머리를 더 보지 않는다 —
                // 시나리오 안의 글자가 우연히 "ASK:" 로 시작할 수 있다
                mode = 'flow'
                if (m[2].trim()) yaml.push(m[2])
            }
            continue
        }
        if (mode === 'flow') yaml.push(line)
        else if (mode === 'say' && line.trim()) say += ` ${line.trim()}`
    }

    if (!marked) {
        // 형식을 통째로 무시한 판. yaml 로 보이면 시나리오로, 아니면 그냥 말로 본다
        if (text.includes('appId:')) return { say: '이렇게 만들어 봤어요.', choices: [], yaml: withHeader(text), note: null }
        return { say: text.slice(0, 600), choices: [], yaml: null, note: null }
    }

    const body = stripFence(yaml.join('\n')).trim()
    return {
        say: say.trim() || '이렇게 만들어 봤어요.',
        choices,
        yaml: body ? withHeader(body) : null,
        note: null,
    }
}

/**
 * 모델이 코드펜스를 붙이는 판이 잦다. 붙었으면 벗기고, 안 붙었으면 그대로 둔다.
 * (프롬프트로 막아도 새는 자리라 받는 쪽에서 한 번 더 본다)
 */
function stripFence(raw: string): string {
    const text = raw.trim()
    const fence = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
    return fence ? fence[1] : text
}

/** appId 줄을 빼먹는 판이 있다. 우리가 아는 값이니 여기서 얹는다 */
function withHeader(yaml: string): string {
    if (appIdOf(yaml)) return `${yaml.trim()}\n`
    return `appId: ${APP_ID}\n---\n${yaml.trim()}\n`
}

/** 우리 실행기가 읽을 수 있나. 읽을 수 있으면 null, 아니면 거절 사유 */
function check(yaml: string): string | null {
    try {
        parseFlow(yaml)
        return null
    } catch (e) {
        return e instanceof FlowParseError ? e.message : String(e).slice(0, 200)
    }
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
    return complete(
        [
            { role: 'system', content: DIAGNOSE_SYSTEM },
            { role: 'user', content: user },
        ],
        60_000,
    )
}
