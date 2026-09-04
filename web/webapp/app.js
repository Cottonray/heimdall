// 「골목」 이벤트 화면 — **앱 안 웹뷰에서 도는 웹앱이다.**
//
// 앱은 이 주소를 띄우기만 하고, 여기서 일어난 일만 자바스크립트 다리(`window.Golmok`)로
// 돌려받는다. 그래서 이 화면의 문구·흐름을 고치는 데 앱 배포가 끼지 않는다.
//
// **QA 관점에서 이 화면이 있는 이유**: 여기 있는 것들은 안드로이드 뷰가 아니라 HTML 이다.
// 접근성 트리에는 글자로만 올라오고 **`resource-id` 가 없다** — 그래서 시나리오가 웹 구간에
// 들어서는 순간 `id:` 로는 아무것도 못 집고 글자로 집어야 한다. 네이티브와 웹을 오가는
// 시나리오가 실제로 어디서 걸리는지를 보여 주는 자리다.

'use strict'

const $ = (id) => document.getElementById(id)

const state = {
  copy: null,
  claimed: new Set(),
  entry: null,
}

/** 앱이 붙여 준 다리. 브라우저에서 그냥 열어 보면 없다 — 그때도 화면은 돌아야 한다 */
function toApp(message) {
  try {
    window.Golmok?.postMessage(JSON.stringify(message))
  } catch {
    // 브라우저로 열어 본 판. 앱이 없을 뿐이라 화면은 그대로 쓴다
  }
}

async function boot() {
  const res = await fetch('copy.json', { cache: 'no-cache' })
  state.copy = await res.json()
  const c = state.copy.web

  $('title').textContent = c.title
  $('sub').textContent = c.sub
  $('note').textContent = c.note
  $('claim-all').textContent = c.claimAll
  $('form-title').textContent = c.formTitle
  $('form-hint').textContent = c.formHint
  $('nick-label').textContent = c.nickLabel
  $('nick').placeholder = c.nickPlaceholder
  $('wish-label').textContent = c.wishLabel
  $('wish').placeholder = c.wishPlaceholder
  $('agree-text').textContent = c.agree
  $('submit').textContent = c.submit
  $('blocked').textContent = c.submitBlocked
  $('done-title').textContent = c.doneTitle
  $('done-body').textContent = c.doneBody
  $('back-to-app').textContent = c.backToApp
  $('history-title').textContent = c.historyTitle
  $('history-empty').textContent = c.historyEmpty

  renderTabs()
  renderCoupons()
  renderHistory()
  syncSubmit()
  // 앱에게 "웹 화면이 다 떴다"고 알린다. 앱은 그때 로딩 표시를 걷는다
  toApp({ type: 'ready' })
}

function renderTabs() {
  const nav = $('tabs')
  nav.replaceChildren()
  state.copy.web.tabs.forEach((label, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.setAttribute('role', 'tab')
    b.setAttribute('aria-selected', String(i === 0))
    // **탭 이름 뒤에 "탭"을 붙여 읽힌다.** 눈에 보이는 글자는 그대로 "응모"지만,
    // 접근성 이름은 "응모 탭"이 된다 — 폼의 [응모] 단추와 이름이 같으면 시나리오가
    // 둘 중 어느 것을 누를지 알 수 없다(화면낭독기를 쓰는 사람도 마찬가지다).
    b.setAttribute('aria-label', `${label} 탭`)
    b.onclick = () => showTab(i)
    nav.append(b)
  })
}

function showTab(index) {
  ;[...$('tabs').children].forEach((b, i) => b.setAttribute('aria-selected', String(i === index)))
  for (let i = 0; i < 3; i += 1) $(`pane-${i}`).hidden = i !== index
  if (index === 2) renderHistory()
}

// ── 쿠폰 ──────────────────────────────────────────────────────────────────

function renderCoupons() {
  const c = state.copy.web
  const ul = $('coupons')
  ul.replaceChildren()

  c.coupons.forEach((coupon, i) => {
    const li = document.createElement('li')
    li.className = state.claimed.has(i) ? 'coupon taken' : 'coupon'

    const amount = document.createElement('div')
    amount.className = 'coupon-amount'
    amount.textContent = coupon.amount

    const copy = document.createElement('div')
    copy.className = 'coupon-copy'
    const name = document.createElement('div')
    name.className = 'coupon-name'
    name.textContent = coupon.name
    const desc = document.createElement('div')
    desc.className = 'coupon-desc'
    desc.textContent = coupon.desc
    const expire = document.createElement('div')
    expire.className = 'coupon-expire'
    expire.textContent = coupon.expire
    copy.append(name, desc, expire)

    const btn = document.createElement('button')
    btn.className = 'btn'
    btn.type = 'button'
    if (state.claimed.has(i)) {
      btn.textContent = c.claimed
      btn.disabled = true
    } else {
      btn.textContent = c.claim
      btn.onclick = () => claim(i)
    }

    li.append(amount, copy, btn)
    ul.append(li)
  })
}

function claim(index) {
  if (state.claimed.has(index)) return
  state.claimed.add(index)
  renderCoupons()
  // **앱이 알아야 하는 값이다.** 마이페이지의 쿠폰 수가 이걸 보고 바뀐다
  toApp({ type: 'coupon', count: state.claimed.size, name: state.copy.web.coupons[index].name })
}

$('claim-all').onclick = () => {
  state.copy.web.coupons.forEach((_, i) => state.claimed.add(i))
  renderCoupons()
  toApp({ type: 'coupon', count: state.claimed.size, name: '' })
}

// ── 응모 ──────────────────────────────────────────────────────────────────

function syncSubmit() {
  const ok = $('nick').value.trim() !== '' && $('wish').value.trim() !== '' && $('agree').checked
  $('submit').disabled = !ok
  $('blocked').hidden = ok
}

$('nick').addEventListener('input', syncSubmit)
$('wish').addEventListener('input', syncSubmit)
$('agree').addEventListener('change', syncSubmit)

$('submit').onclick = () => {
  const nick = $('nick').value.trim()
  const wish = $('wish').value.trim()
  if (!nick || !wish || !$('agree').checked) return
  state.entry = { nick, wish }
  $('done').hidden = false
  $('submit').disabled = true
  renderHistory()
  // 앱이 이 결과로 안내를 띄운다 — 여기서부터 다시 네이티브다
  toApp({ type: 'entry', nick, wish })
}

$('back-to-app').onclick = () => toApp({ type: 'close' })

// ── 내역 ──────────────────────────────────────────────────────────────────

function renderHistory() {
  const c = state.copy.web
  const ul = $('history')
  ul.replaceChildren()

  for (const i of state.claimed) {
    const li = document.createElement('li')
    li.textContent = c.coupons[i].name
    const small = document.createElement('small')
    small.textContent = `${c.coupons[i].amount} · ${c.coupons[i].expire}`
    li.append(small)
    ul.append(li)
  }
  if (state.entry) {
    const li = document.createElement('li')
    li.textContent = state.entry.wish
    const small = document.createElement('small')
    small.textContent = state.entry.nick
    li.append(small)
    ul.append(li)
  }
  $('history-empty').hidden = ul.childElementCount > 0
}

void boot()
