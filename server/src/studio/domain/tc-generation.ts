// TC 자동 생성의 규칙 부분. HTTP·DB·LLM 을 모른다.
//
// 모델이 하는 일은 "조건을 읽어 내기"와 "케이스 문장 쓰기" 둘뿐이다. 나머지는 코드가
// 정한다 — 민감정보 마스킹, 지시문 차단, 숫자 경계값 계산, 근거 대조, 중복 제거,
// 빠진 경계값 보충, 요구사항-TC 매핑, 상품 패턴의 분기·부결 전개. 모델이 그럴듯하게
// 틀려도 이 단계에서 걸리게 하려는 것이다.
import { createHash } from "node:crypto";
import type {
  TcCondition,
  TcIssue,
  TcPattern,
  TcPatternField,
  TcPatternRule,
  TcRequirement,
  TcSensitiveTag,
  TestCase,
  TcType,
} from "../../../../contracts/studio.ts";

export const LIMITS = {
  text: 20000,
  requirements: 60,
  conditions: 80,
  cases: 300,
} as const;

// ── 1.1.1.1 수집·정규화 ─────────────────────────────────────────────────

const SENSITIVE: { type: string; label: string; re: RegExp; check?: (v: string) => boolean }[] = [
  { type: "driver", label: "운전면허번호", re: /\b\d{2}-\d{2}-\d{6}-\d{2}\b/g },
  {
    type: "rrn",
    label: "주민·외국인등록번호",
    re: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-?[1-8]\d{6}\b/g,
  },
  { type: "card", label: "카드번호", re: /\b(?:\d{4}[- ]?){3}\d{4}\b/g, check: luhn },
  { type: "phone", label: "휴대전화번호", re: /\b01[016789]-?\d{3,4}-?\d{4}\b/g },
  { type: "account", label: "계좌번호", re: /\b\d{2,6}-\d{2,6}-\d{2,8}\b/g },
  { type: "email", label: "이메일", re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { type: "passport", label: "여권번호", re: /\b[A-Z]{1,2}\d{7,8}\b/g },
];
function luhn(value: string) {
  const digits = value.replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}
export function maskSensitive(text: string) {
  const tags = new Map<string, TcSensitiveTag>();
  let masked = text;
  for (const rule of SENSITIVE)
    masked = masked.replace(rule.re, (found) => {
      if (rule.check && !rule.check(found)) return found;
      const tag = tags.get(rule.type) ?? { type: rule.type, label: rule.label, count: 0 };
      tag.count++;
      tags.set(rule.type, tag);
      return `[${rule.label}]`;
    });
  return { masked, tags: [...tags.values()] };
}

// 명세 안에 섞여 들어온 "모델에게 하는 말". 프롬프트에서 데이터라고 일러도 모델은
// 따르기도 해서, 코드가 먼저 그 줄을 빼고 무엇을 뺐는지 기록한다.
const INJECTION =
  /(ignore|disregard|forget)\W+(all\W+)?(the\W+)?(previous|above|prior)|system\s*prompt|you\s+are\s+now|act\s+as\b|이전\s*(의\s*)?(지시|명령|프롬프트)|(지시|명령|규칙)(을|를|사항을)?\s*(모두\s*)?무시|시스템\s*프롬프트|프롬프트(를|을)?\s*(출력|공개|보여)|너는\s*이제|역할을\s*바꿔|답변\s*형식을\s*바꿔/i;

const TYPOS: [RegExp, string][] = [
  [/되요/g, "돼요"],
  [/됬/g, "됐"],
  [/몇일/g, "며칠"],
  [/않되/g, "안 되"],
  [/할수\s*있/g, "할 수 있"],
  [/될수\s*있/g, "될 수 있"],
  [/수\s*없읍니다/g, "수 없습니다"],
  [/읍니다/g, "습니다"],
];
const ID = /^\s*\[?((?:REQ|SR|FR|NFR|UR|CSR|RQ)[-_ ]?\d{1,5})\]?\s*[.:)\]-]?\s*/i;

export function normalizeRequirements(raw: string) {
  if (typeof raw !== "string" || !raw.trim())
    throw new Error("요구사항 명세를 입력해 주세요.");
  if (raw.length > LIMITS.text)
    throw new Error(`요구사항은 ${LIMITS.text.toLocaleString()}자 이내로 입력해 주세요.`);
  const corrections: string[] = [];
  let text = raw
    .normalize("NFKC")
    .replace(/[​-‍﻿­]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ");
  for (const [re, to] of TYPOS)
    text = text.replace(re, (found) => {
      corrections.push(`${found} → ${to}`);
      return found.replace(re, to);
    });
  const { masked, tags } = maskSensitive(text);
  const seen = new Set<string>();
  const blocked: string[] = [];
  const requirements: TcRequirement[] = [];
  const lines: string[] = [];
  const used = new Set<string>();
  let section = "";
  let duplicates = 0;
  let auto = 0;
  for (const original of masked.split("\n")) {
    let line = original
      .replace(/^\s*(?:[-*•·▪◦‣○●□■◆◇※>]+|\d{1,2}[.)]|[①-⑳]|[가-하][.)])\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    if (INJECTION.test(line)) {
      blocked.push(line.slice(0, 200));
      continue;
    }
    const key = line.replace(/[\s.,;:!?·]/g, "").toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    const heading = /^#+\s*/.test(original.trim()) || (/[:：]$/.test(line) && line.length <= 40);
    if (heading) {
      section = line.replace(/^#+\s*/, "").replace(/[:：]$/, "").trim();
      lines.push(`## ${section}`);
      continue;
    }
    const idMatch = line.match(ID);
    let id = idMatch ? idMatch[1]!.toUpperCase().replace(/[_ ]/, "-") : "";
    if (idMatch) line = line.slice(idMatch[0].length).trim();
    if (!line) continue;
    if (!id || used.has(id)) {
      do id = `REQ-${String(++auto).padStart(3, "0")}`;
      while (used.has(id));
    }
    used.add(id);
    requirements.push({ id, text: line, ...(section ? { section } : {}) });
    lines.push(`${id} ${line}`);
  }
  if (duplicates) corrections.push(`중복 문장 ${duplicates}개 제거`);
  if (!requirements.length)
    throw new Error("테스트할 요구사항 문장을 찾지 못했어요. 한 줄에 하나씩 적어 주세요.");
  if (requirements.length > LIMITS.requirements)
    throw new Error(`요구사항은 한 번에 ${LIMITS.requirements}개까지 처리해요.`);
  return { normalized: lines.join("\n"), requirements, sensitive: tags, blocked, corrections };
}

// ── 1.1.1.2 숫자 경계값 (코드가 계산) ─────────────────────────────────────

export type Boundary = {
  requirementId: string;
  subject: string;
  evidence: string;
  op: "이상" | "이하" | "초과" | "미만";
  value: number;
  unit: string;
  pass: number[];
  fail: number[];
};
const UNIT = "(만원|억원|천원|원|자리|자|세|개월|년|일|회|건|%|점|개|명|시간|분|초|MB|KB)?";
const NUMBER = "(\\d[\\d,]*(?:\\.\\d+)?)";
function decimals(n: string) {
  return n.includes(".") ? n.split(".")[1]!.length : 0;
}
function round(n: number, places: number) {
  return Number(n.toFixed(places));
}
// 시각은 분 단위 숫자로 들고 다니고 HH:MM 으로 보인다 (23:30 → 1410, 자정을 넘으면 돌아간다)
export const TIME = "시각";
export function formatValue(value: number, unit: string) {
  if (unit === TIME) {
    const m = ((value % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}${unit}`;
}
export function mentions(input: string, value: number, unit: string) {
  const shown = formatValue(value, unit).replace(/,/g, "");
  const number = unit === TIME ? shown : String(value);
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\d.:])${escaped}(?![\\d:])`).test(input.replace(/,/g, ""));
}
function subjectBefore(text: string, index: number) {
  const before = text.slice(0, index).split(/[,.;]|(?:하고|하며|으며|이며|이고|이면|면서)\s/).pop() ?? "";
  return (
    before
      .replace(/(최소|최대|최저|최고|1회|1일|하루|월|연)\s*$/, "")
      .replace(/(은|는|이|가|을|를|의|도|에서|으로|로)\s*$/, "")
      .trim()
      .split(" ")
      .slice(-3)
      .join(" ") || "값"
  );
}
export function extractBoundaries(requirements: TcRequirement[]): Boundary[] {
  const found: Boundary[] = [];
  for (const req of requirements) {
    // 시각(23:30)의 숫자가 금액·횟수 규칙에 잡히지 않게, 시각 범위를 먼저 읽고 자리를 지운다
    let text = req.text;
    const times = [...text.matchAll(/(\d{1,2}):(\d{2})\s*(?:~|∼|부터|에서)\s*(\d{1,2}):(\d{2})(?:\s*까지)?/g)];
    text = text.replace(/\d{1,2}:\d{2}/g, (t) => "#".repeat(t.length));
    const lead = (text.split(" ")[0] ?? "").replace(/(은|는|이|가|을|를|의|도)$/, "") || "값";
    const push = (index: number, raw: string, unit: string, op: Boundary["op"], evidence: string) => {
      if (unit === TIME) {
        const value = Number(raw);
        const pass = op === "이상" ? [value, value + 1] : [value - 1, value];
        const fail = op === "이상" ? [value - 1] : [value + 1];
        found.push({ requirementId: req.id, subject: subjectBefore(text, index) === "값" ? "시각" : `${subjectBefore(text, index)} 시각`, evidence, op, value, unit, pass, fail });
        return;
      }
      const places = decimals(raw);
      const value = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(value)) return;
      const step = places ? 10 ** -places : 1;
      const below = round(value - step, places);
      const above = round(value + step, places);
      const pass = op === "이상" ? [value, above] : op === "이하" ? [below, value] : op === "초과" ? [above] : [below];
      const fail = op === "이상" ? [below] : op === "이하" ? [above] : op === "초과" ? [value] : [value];
      // "최소 1원, 최대 500만원"의 둘째 값처럼 주어가 앞 절에 있으면 앞의 주어를 잇는다
      let subject = subjectBefore(text, index);
      if (subject === "값") subject = found.filter((b) => b.requirementId === req.id).at(-1)?.subject ?? lead;
      if (found.some((b) => b.requirementId === req.id && b.subject === subject && b.value === value && b.op === op)) return;
      found.push({ requirementId: req.id, subject, evidence, op, value, unit, pass, fail });
    };
    for (const m of times) {
      const evidence = m[0];
      push(m.index!, String(Number(m[1]) * 60 + Number(m[2])), TIME, "이상", evidence);
      push(m.index!, String(Number(m[3]) * 60 + Number(m[4])), TIME, "이하", evidence);
    }
    for (const m of text.matchAll(new RegExp(`${NUMBER}\\s*${UNIT}\\s*(이상|이하|초과|미만)`, "g")))
      push(m.index!, m[1]!, m[2] ?? "", m[3] as Boundary["op"], m[0]);
    for (const m of text.matchAll(new RegExp(`(최소|최저|최대|최고)\\s*${NUMBER}\\s*${UNIT}(?!\\s*(?:이상|이하|초과|미만))`, "g")))
      push(m.index!, m[2]!, m[3] ?? "", /최소|최저/.test(m[1]!) ? "이상" : "이하", m[0]);
    for (const m of text.matchAll(new RegExp(`${NUMBER}\\s*${UNIT}\\s*(?:~|∼|부터)\\s*${NUMBER}\\s*${UNIT}(?:\\s*까지)?`, "g"))) {
      const unit = m[4] || m[2] || "";
      push(m.index!, m[1]!, unit, "이상", m[0]);
      push(m.index!, m[3]!, unit, "이하", m[0]);
    }
  }
  return found;
}
export function boundaryConditions(boundaries: Boundary[]): TcCondition[] {
  return boundaries.map((b, i) => ({
    id: `B-${String(i + 1).padStart(3, "0")}`,
    requirementIds: [b.requirementId],
    kind: "boundary",
    subject: b.subject,
    description: `${b.subject} ${formatValue(b.value, b.unit)} ${b.op} — 해당 ${b.pass.map((v) => formatValue(v, b.unit)).join(", ")} / 미해당 ${b.fail.map((v) => formatValue(v, b.unit)).join(", ")}`,
    values: [...b.fail, ...b.pass].sort((x, y) => x - y).map((v) => formatValue(v, b.unit)),
    evidence: b.evidence,
    grounded: true,
    origin: "rule",
  }));
}

// ── 모델 산출물 정리 ─────────────────────────────────────────────────────

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, max = 12, each = 300) =>
  Array.isArray(v) ? v.map((x) => str(typeof x === "number" ? String(x) : x, each)).filter(Boolean).slice(0, max) : [];
const squash = (s: string) => s.replace(/[\s"'“”‘’「」『』.,·]/g, "");

export function readConditions(raw: unknown, requirements: TcRequirement[], normalized: string): TcCondition[] {
  const ids = new Set(requirements.map((r) => r.id));
  const items = Array.isArray((raw as { conditions?: unknown })?.conditions)
    ? ((raw as { conditions: unknown[] }).conditions)
    : [];
  const body = squash(normalized);
  return items.slice(0, LIMITS.conditions).flatMap((item, i) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const kind = ["input", "branch", "boundary", "rule"].includes(String(o.kind)) ? (o.kind as TcCondition["kind"]) : "rule";
    const requirementIds = list(o.requirementIds, 6, 20).filter((id) => ids.has(id));
    const description = str(o.description, 400);
    if (!description || !requirementIds.length) return [];
    const evidence = str(o.evidence, 300);
    return [{
      id: `C-${String(i + 1).padStart(3, "0")}`,
      requirementIds,
      kind,
      subject: str(o.subject, 80) || "조건",
      description,
      values: list(o.values, 10, 80),
      evidence,
      grounded: !!evidence && body.includes(squash(evidence)),
      origin: "ai" as const,
    }];
  });
}

export function readCases(raw: unknown): Omit<TestCase, "id">[] {
  const items = Array.isArray((raw as { cases?: unknown })?.cases) ? ((raw as { cases: unknown[] }).cases) : [];
  return items.slice(0, 60).flatMap((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const type: TcType = ["normal", "exception", "boundary"].includes(String(o.type)) ? (o.type as TcType) : "normal";
    const title = str(o.title, 160);
    const expected = str(o.expected, 400);
    if (!title || !expected) return [];
    return [{
      title,
      type,
      requirementIds: list(o.requirementIds, 6, 20),
      conditionIds: list(o.conditionIds, 8, 20),
      preconditions: list(o.preconditions, 6),
      steps: list(o.steps, 12),
      input: str(o.input, 400),
      expected,
      rationale: str(o.rationale, 300),
      origin: "ai" as const,
    }];
  });
}

// ── 1.1.1.4 정합성·중복 검증 + 매핑 ──────────────────────────────────────

function tokens(s: string) {
  return new Set(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean));
}
function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b);
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both);
}
const caseKey = (c: Omit<TestCase, "id">) => `${c.type} ${c.input} ${c.expected}`;

export function verifyCases(
  candidates: Omit<TestCase, "id">[],
  requirements: TcRequirement[],
  conditions: TcCondition[],
  boundaries: Boundary[],
) {
  const issues: TcIssue[] = [];
  const reqIds = new Set(requirements.map((r) => r.id));
  const condById = new Map(conditions.map((c) => [c.id, c]));
  const kept: Omit<TestCase, "id">[] = [];
  for (const c of candidates) {
    const conditionIds = c.conditionIds.filter((id) => condById.has(id));
    const fromConditions = conditionIds.flatMap((id) => condById.get(id)!.requirementIds);
    const requirementIds = [...new Set([...c.requirementIds.filter((id) => reqIds.has(id)), ...fromConditions])];
    if (!requirementIds.length) {
      issues.push({ level: "warning", code: "unmapped", message: `요구사항에 연결되지 않아 제외: ${c.title}` });
      continue;
    }
    if (c.requirementIds.some((id) => !reqIds.has(id)))
      issues.push({ level: "info", code: "unknown-requirement", message: `없는 요구사항 번호를 지움: ${c.title}` });
    // 입력값이 다르면 다른 시험이다(경계값 9,999원과 10,000원). 입력이 같고 기대결과가
    // 거의 같을 때만, 입력이 둘 다 없으면 제목까지 비교해 중복으로 본다.
    const twin = kept.find(
      (k) =>
        k.type === c.type &&
        squash(k.input) === squash(c.input) &&
        (k.input ? similarity(k.expected, c.expected) >= 0.8 : similarity(caseKey(k) + k.title, caseKey(c) + c.title) >= 0.85),
    );
    if (twin) {
      // 지운 쪽이 가리키던 요구사항·조건은 남긴 쪽이 이어받는다 (추적이 끊기지 않게)
      twin.requirementIds = [...new Set([...twin.requirementIds, ...requirementIds])];
      twin.conditionIds = [...new Set([...twin.conditionIds, ...conditionIds])];
      issues.push({ level: "info", code: "duplicate", message: `중복 병합: "${c.title}" → "${twin.title}"` });
      continue;
    }
    if (c.type !== "normal" && !c.input)
      issues.push({ level: "warning", code: "no-input", message: `${c.type === "boundary" ? "경계" : "예외"} 케이스에 입력값이 없어요: ${c.title}` });
    kept.push({ ...c, requirementIds, conditionIds });
  }
  // 코드가 계산한 경계값이 TC 입력에 하나도 안 나오면 코드가 직접 채운다
  for (const b of boundaries) {
    const cond = conditions.find((c) => c.origin === "rule" && c.evidence === b.evidence && c.requirementIds[0] === b.requirementId && c.subject === b.subject);
    for (const [value, pass] of [...b.fail.map((v) => [v, false] as const), ...b.pass.map((v) => [v, true] as const)]) {
      const shown = formatValue(value, b.unit);
      const covered = kept.some((k) => k.requirementIds.includes(b.requirementId) && mentions(`${k.input} ${k.title}`, value, b.unit));
      if (covered) continue;
      kept.push({
        title: `${b.subject} ${shown} — '${formatValue(b.value, b.unit)} ${b.op}' ${pass ? "해당" : "미해당"}`,
        type: "boundary",
        requirementIds: [b.requirementId],
        conditionIds: cond ? [cond.id] : [],
        preconditions: [],
        steps: [`${b.subject}에 ${shown}을(를) 입력한다`, "다음 단계로 진행한다"],
        input: `${b.subject}=${shown}`,
        expected: pass
          ? `"${b.evidence}" 조건에 해당할 때의 처리가 일어난다`
          : `"${b.evidence}" 조건에 해당하지 않을 때의 처리가 일어난다`,
        rationale: `요구사항 원문 "${b.evidence}"에서 코드가 계산한 경계값`,
        origin: "rule",
      });
      issues.push({ level: "info", code: "boundary-filled", message: `빠진 경계값 ${b.subject} ${shown}을(를) 코드가 보충` });
    }
  }
  for (const cond of conditions) {
    if (!cond.grounded)
      issues.push({ level: "warning", code: "ungrounded", message: `원문에서 근거 문장을 찾지 못한 조건: ${cond.description}`, targetId: cond.id });
    const linked = kept.filter((k) => k.conditionIds.includes(cond.id));
    if (!linked.length)
      issues.push({ level: "warning", code: "uncovered-condition", message: `TC가 없는 조건: ${cond.description}`, targetId: cond.id });
    else if (cond.origin === "ai" && !linked.some((k) => k.type !== "normal"))
      issues.push({ level: "warning", code: "no-negative", message: `예외·경계 TC가 없는 조건: ${cond.description}`, targetId: cond.id });
  }
  for (const req of requirements) {
    const linked = kept.filter((k) => k.requirementIds.includes(req.id));
    if (!linked.length)
      issues.push({ level: "error", code: "uncovered-requirement", message: `TC가 하나도 없는 요구사항: ${req.id}`, targetId: req.id });
  }
  const order: Record<TcType, number> = { normal: 0, exception: 1, boundary: 2 };
  const firstReq = (c: Omit<TestCase, "id">) => requirements.findIndex((r) => r.id === c.requirementIds[0]);
  const cases = kept
    .slice(0, LIMITS.cases)
    .sort((a, b) => firstReq(a) - firstReq(b) || order[a.type] - order[b.type])
    .map((c, i) => ({ id: `TC-${String(i + 1).padStart(3, "0")}`, ...c }));
  return { cases, issues };
}

// ── 무결성 ──────────────────────────────────────────────────────────────

export function contentHash(value: unknown) {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
        : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

// ── 1.1.4 상품 패턴 ─────────────────────────────────────────────────────

export const BUILT_IN_PATTERNS: TcPattern[] = [
  {
    id: "builtin-deposit-saving",
    domain: "deposit",
    name: "가상 자유적금 가입",
    description: "가상의 수신 상품. 가입금액·기간 검증과 가입 경로·우대금리 화면 분기.",
    builtIn: true,
    updated: 0,
    fields: [
      { key: "age", label: "고객 나이", type: "number", unit: "세", min: 19, sample: "35" },
      { key: "monthly", label: "월 납입액", type: "number", unit: "원", min: 10000, max: 1000000, sample: "300000" },
      { key: "term", label: "가입기간", type: "choice", unit: "개월", options: ["6", "12", "24", "36"], sample: "12" },
      { key: "channel", label: "가입 경로", type: "choice", options: ["모바일", "영업점"], sample: "모바일" },
      { key: "salary", label: "급여이체 여부", type: "choice", options: ["예", "아니오"], sample: "아니오" },
    ],
    branches: [
      { id: "BR-01", label: "모바일 가입", field: "channel", equals: "모바일", screen: "비대면 실명확인(신분증 촬영) 화면으로 이동" },
      { id: "BR-02", label: "영업점 가입", field: "channel", equals: "영업점", screen: "창구 실명확인 안내 화면 표시" },
      { id: "BR-03", label: "급여이체 우대", field: "salary", equals: "예", screen: "우대금리 연 0.3%p 적용 안내가 상품설명 화면에 표시" },
    ],
    rules: [],
  },
  {
    id: "builtin-loan-credit",
    domain: "loan",
    name: "가상 직장인 신용대출 심사",
    description: "가상의 여신 상품. 사유별 부결 룰 다섯 개와 승인 기준 케이스.",
    builtIn: true,
    updated: 0,
    fields: [
      { key: "age", label: "나이", type: "number", unit: "세", min: 19, max: 64, sample: "35" },
      { key: "score", label: "신용점수", type: "number", unit: "점", sample: "780" },
      { key: "dsr", label: "DSR", type: "number", unit: "%", step: 0.1, sample: "25" },
      { key: "tenure", label: "재직기간", type: "number", unit: "개월", sample: "36" },
      { key: "overdue", label: "최근 1년 최장 연체일수", type: "number", unit: "일", sample: "0" },
      { key: "amount", label: "신청금액", type: "number", unit: "만원", min: 100, max: 10000, sample: "3000" },
    ],
    branches: [],
    rules: [
      { code: "R01", reason: "신용점수 기준 미달", field: "score", op: "<", value: "600" },
      { code: "R02", reason: "DSR 한도 초과", field: "dsr", op: ">", value: "40" },
      { code: "R03", reason: "재직기간 부족", field: "tenure", op: "<", value: "3" },
      { code: "R04", reason: "연체 이력", field: "overdue", op: ">=", value: "30" },
      { code: "R05", reason: "연령 기준 미충족", field: "age", op: "<", value: "19" },
    ],
  },
];

// dropped 를 넘기면 관대 모드다 (모델이 뽑은 초안). 틀린 분기를 오류로 세우지 않고 빼면서 이유를 남긴다.
export function validatePattern(raw: unknown, dropped?: string[]): Omit<TcPattern, "id" | "builtIn" | "updated"> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const domain = o.domain === "loan" ? "loan" : o.domain === "deposit" ? "deposit" : null;
  if (!domain) throw new Error("영역은 수신(deposit) 또는 여신(loan)이어야 해요.");
  const name = str(o.name, 80);
  if (!name) throw new Error("패턴 이름을 입력해 주세요.");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const fields: TcPatternField[] = (Array.isArray(o.fields) ? o.fields : []).slice(0, 30).map((f, i) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const key = str(x.key, 40).replace(/[^\w-]/g, "") || `f${i + 1}`;
    const type = x.type === "choice" ? "choice" : "number";
    const options = list(x.options, 12, 40);
    const field: TcPatternField = { key, label: str(x.label, 60) || key, type, sample: str(typeof x.sample === "number" ? String(x.sample) : x.sample, 60) };
    const unit = str(x.unit, 10);
    if (unit) field.unit = unit;
    if (type === "number") {
      const min = num(x.min), max = num(x.max), step = num(x.step);
      if (min !== undefined) field.min = min;
      if (max !== undefined) field.max = max;
      if (step !== undefined && step > 0) field.step = step;
      if (!field.sample || !Number.isFinite(Number(field.sample))) field.sample = String(min ?? max ?? 0);
    } else {
      if (!options.length) throw new Error(`선택형 항목 ${field.label}에 선택지가 없어요.`);
      field.options = options;
      if (!options.includes(field.sample)) field.sample = options[0]!;
    }
    return field;
  });
  if (!fields.length) throw new Error("입력 항목(fields)이 최소 하나 필요해요.");
  if (new Set(fields.map((f) => f.key)).size !== fields.length) throw new Error("입력 항목 key가 겹쳐요.");
  const byKey = new Map(fields.map((f) => [f.key, f]));
  // 분기는 선택형 항목의 선택지 하나에 붙는다. "650점 미만" 같은 숫자 조건은 분기가 아니라 부결 룰이다.
  const branches = (Array.isArray(o.branches) ? o.branches : []).slice(0, 40).flatMap((b, i) => {
    const x = (b ?? {}) as Record<string, unknown>;
    const field = str(x.field, 40);
    const equals = str(typeof x.equals === "number" ? String(x.equals) : x.equals, 60);
    const target = byKey.get(field);
    const problem = !target
      ? `분기 ${i + 1}의 항목 ${field || "(없음)"}이 fields에 없어요.`
      : target.type !== "choice" || !target.options!.includes(equals)
        ? `분기 ${i + 1}(${str(x.label, 40) || field})은 선택형 항목의 선택지에만 붙일 수 있어요.`
        : "";
    if (problem) {
      if (!dropped) throw new Error(problem);
      dropped.push(problem);
      return [];
    }
    return [{ id: str(x.id, 20) || `BR-${String(i + 1).padStart(2, "0")}`, label: str(x.label, 80) || field, field, equals, screen: str(x.screen, 200), ...(str(x.source, 300) ? { source: str(x.source, 300) } : {}) }];
  });
  const rules: TcPatternRule[] = (Array.isArray(o.rules) ? o.rules : []).slice(0, 40).map((r, i) => {
    const x = (r ?? {}) as Record<string, unknown>;
    const field = str(x.field, 40);
    if (!byKey.has(field)) throw new Error(`부결 룰 ${i + 1}의 항목 ${field || "(없음)"}이 fields에 없어요.`);
    const op = ["<", "<=", ">", ">=", "="].includes(String(x.op)) ? (x.op as TcPatternRule["op"]) : null;
    if (!op) throw new Error(`부결 룰 ${i + 1}의 비교 연산자를 확인해 주세요.`);
    const value = str(typeof x.value === "number" ? String(x.value) : x.value, 40);
    if (byKey.get(field)!.type === "number" && !Number.isFinite(Number(value))) throw new Error(`부결 룰 ${i + 1}의 기준값이 숫자가 아니에요.`);
    return { code: str(x.code, 20) || `R${String(i + 1).padStart(2, "0")}`, reason: str(x.reason, 120) || "부결", field, op, value, ...(str(x.source, 300) ? { source: str(x.source, 300) } : {}) };
  });
  // 항목 범위가 부결 룰과 같은 경계면(신용점수 min 650 + "650 미만 부결") 범위를 지운다.
  // 남겨 두면 같은 값에 '입력 오류'와 '부결'이라는 다른 기대결과가 붙는다.
  for (const field of fields)
    for (const bound of ["min", "max"] as const) {
      const value = field[bound];
      if (value === undefined) continue;
      const rule = rules.find((r) => r.field === field.key && Number(r.value) === value && (bound === "min" ? r.op === "<" || r.op === "<=" : r.op === ">" || r.op === ">="));
      if (!rule) continue;
      delete field[bound];
      dropped?.push(`${field.label}의 ${bound === "min" ? "최소" : "최대"}값은 부결 룰 ${rule.code}와 같아 범위에서 뺐어요.`);
    }
  return { domain, name, description: str(o.description, 400), fields, branches, rules };
}

// 기준 케이스(모두 통과)의 값. 부결 룰에 걸리는 표본값이면 룰 바깥으로 옮긴다.
function baseline(p: Omit<TcPattern, "id" | "builtIn" | "updated">) {
  const values: Record<string, string> = {};
  for (const f of p.fields) values[f.key] = f.sample;
  for (const r of p.rules) if (fails(r, values[r.field]!)) values[r.field] = passingValue(r, p.fields.find((f) => f.key === r.field)!);
  return values;
}
function stepOf(f: TcPatternField) {
  return f.step ?? 1;
}
function places(f: TcPatternField) {
  return decimals(String(stepOf(f)));
}
function fails(r: TcPatternRule, value: string) {
  const a = Number(value), b = Number(r.value);
  if (r.op === "=") return value === r.value;
  if (!Number.isFinite(a)) return false;
  return r.op === "<" ? a < b : r.op === "<=" ? a <= b : r.op === ">" ? a > b : a >= b;
}
function passingValue(r: TcPatternRule, f: TcPatternField) {
  if (r.op === "=") return f.options?.find((o) => o !== r.value) ?? `${r.value} 아님`;
  const v = Number(r.value), s = stepOf(f), p = places(f);
  return String(round(r.op === "<" ? v : r.op === "<=" ? v + s : r.op === ">" ? v : v - s, p));
}
function failingValue(r: TcPatternRule, f: TcPatternField) {
  if (r.op === "=") return r.value;
  const v = Number(r.value), s = stepOf(f), p = places(f);
  return String(round(r.op === "<" ? v - s : r.op === "<=" ? v : r.op === ">" ? v + s : v, p));
}
function amount(v: number, unit = "") {
  // 3,000만원은 그대로, 20,000만원은 2억원으로 읽히게
  if (unit === "만원" && Math.abs(v) >= 10000 && Number.isInteger(v)) {
    const eok = Math.trunc(v / 10000), man = Math.abs(v % 10000);
    return `${eok}억${man ? ` ${man.toLocaleString("ko-KR")}만` : ""}원`;
  }
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}${unit}`;
}
const show = (f: TcPatternField, v: string) => `${f.label} ${Number.isFinite(Number(v)) && f.type === "number" ? amount(Number(v), f.unit) : `${v}${f.unit ?? ""}`}`;

export function expandPattern(p: TcPattern) {
  const requirements: TcRequirement[] = [];
  const conditions: TcCondition[] = [];
  const cases: Omit<TestCase, "id">[] = [];
  const base = baseline(p);
  const byKey = new Map(p.fields.map((f) => [f.key, f]));
  const describe = (values: Record<string, string>) => p.fields.map((f) => show(f, values[f.key]!)).join(", ");
  const ok = p.domain === "loan" ? "심사 승인, 한도·금리 안내 화면으로 이동" : "다음 단계로 진행";
  const add = (req: TcRequirement, cond: Omit<TcCondition, "id" | "requirementIds" | "grounded" | "origin">, made: Omit<TestCase, "id" | "requirementIds" | "conditionIds" | "origin" | "preconditions">[]) => {
    requirements.push(req);
    const id = `P-${String(conditions.length + 1).padStart(3, "0")}`;
    conditions.push({ id, requirementIds: [req.id], grounded: true, origin: "pattern", ...cond });
    for (const m of made) cases.push({ ...m, requirementIds: [req.id], conditionIds: [id], preconditions: [`상품: ${p.name}`], origin: "pattern" });
  };
  add(
    { id: "PT-BASE", text: `모든 조건을 충족하는 기준 고객은 ${ok}`, section: "기준" },
    { kind: "rule", subject: "기준", description: "모든 항목이 정상 범위", values: [describe(base)], evidence: "패턴 표본값" },
    [{ title: `기준 고객 — ${ok}`, type: "normal", steps: ["기준값으로 모든 항목을 입력한다", "신청을 제출한다"], input: describe(base), expected: ok, rationale: "모든 룰을 통과하는 표본" }],
  );
  for (const f of p.fields) {
    if (f.type === "choice") {
      add(
        { id: `PT-${f.key}`, text: `${f.label}은(는) ${f.options!.join("/")} 중 하나를 선택한다`, section: "입력 항목" },
        { kind: "input", subject: f.label, description: `${f.label} 선택지 ${f.options!.length}개`, values: f.options!, evidence: "패턴 선택지" },
        f.options!.map((o) => ({ title: `${f.label} '${o}' 선택`, type: "normal" as const, steps: [`${f.label}에서 ${o}을(를) 선택한다`, "다음 단계로 진행한다"], input: describe({ ...base, [f.key]: o }), expected: p.branches.find((b) => b.field === f.key && b.equals === o)?.screen || ok, rationale: "선택지 전개" })),
      );
      continue;
    }
    if (f.min === undefined && f.max === undefined) continue;
    const s = stepOf(f), pl = places(f);
    const made: Omit<TestCase, "id" | "requirementIds" | "conditionIds" | "origin" | "preconditions">[] = [];
    if (f.min !== undefined)
      made.push(
        { title: `${f.label} 최소값 ${show(f, String(f.min))}`, type: "boundary", steps: [`${f.label}에 최소값을 입력한다`], input: describe({ ...base, [f.key]: String(f.min) }), expected: ok, rationale: "최소 경계 통과" },
        { title: `${f.label} 최소값 미만 ${show(f, String(round(f.min - s, pl)))}`, type: "boundary", steps: [`${f.label}에 최소값보다 작은 값을 입력한다`], input: describe({ ...base, [f.key]: String(round(f.min - s, pl)) }), expected: `${f.label} 입력 오류 안내, 진행 불가`, rationale: "최소 경계 바로 아래" },
      );
    if (f.max !== undefined)
      made.push(
        { title: `${f.label} 최대값 ${show(f, String(f.max))}`, type: "boundary", steps: [`${f.label}에 최대값을 입력한다`], input: describe({ ...base, [f.key]: String(f.max) }), expected: ok, rationale: "최대 경계 통과" },
        { title: `${f.label} 최대값 초과 ${show(f, String(round(f.max + s, pl)))}`, type: "boundary", steps: [`${f.label}에 최대값보다 큰 값을 입력한다`], input: describe({ ...base, [f.key]: String(round(f.max + s, pl)) }), expected: `${f.label} 입력 오류 안내, 진행 불가`, rationale: "최대 경계 바로 위" },
      );
    add(
      { id: `PT-${f.key}`, text: `${f.label} 허용 범위 ${f.min !== undefined ? show(f, String(f.min)) + " 이상" : ""} ${f.max !== undefined ? show(f, String(f.max)) + " 이하" : ""}`.replace(/\s+/g, " ").trim(), section: "입력 항목" },
      { kind: "boundary", subject: f.label, description: `${f.label} 범위 검증`, values: made.map((m) => m.title), evidence: "패턴 범위" },
      made,
    );
  }
  for (const b of p.branches) {
    const f = byKey.get(b.field)!;
    add(
      { id: `PT-${b.id}`, text: `${f.label}이(가) ${b.equals}이면 ${b.screen}`, section: "화면 분기" },
      { kind: "branch", subject: b.label, description: `${show(f, b.equals)} → ${b.screen}`, values: [b.equals], evidence: b.source || "패턴 분기" },
      [{ title: `[분기] ${b.label}`, type: "normal", steps: [`${f.label}에 ${b.equals}을(를) 선택한다`, "다음 화면을 확인한다"], input: describe({ ...base, [b.field]: b.equals }), expected: b.screen, rationale: `분기 ${b.id}` }],
    );
  }
  for (const r of p.rules) {
    const f = byKey.get(r.field)!;
    const bad = failingValue(r, f), good = passingValue(r, f);
    add(
      { id: `PT-${r.code}`, text: `${f.label} ${r.op} ${r.value}${f.unit ?? ""}이면 '${r.reason}'(${r.code})으로 부결한다`, section: "부결 사유" },
      { kind: "rule", subject: r.reason, description: `${f.label} ${r.op} ${r.value}${f.unit ?? ""} → 부결 ${r.code}`, values: [bad, good], evidence: r.source || "패턴 부결 룰" },
      [
        { title: `[부결 ${r.code}] ${r.reason} — ${show(f, bad)}`, type: "exception", steps: [`${f.label}만 ${bad}${f.unit ?? ""}로 두고 나머지는 기준값으로 입력한다`, "심사를 요청한다"], input: describe({ ...base, [r.field]: bad }), expected: `부결, 사유 코드 ${r.code} '${r.reason}' 안내`, rationale: "해당 룰 하나만 위반" },
        { title: `[경계 ${r.code}] ${show(f, good)} 통과`, type: "boundary", steps: [`${f.label}을 기준 바로 안쪽 값 ${good}${f.unit ?? ""}로 입력한다`, "심사를 요청한다"], input: describe({ ...base, [r.field]: good }), expected: `${r.code} 사유로 부결되지 않음 (${ok})`, rationale: "룰 기준값 경계" },
      ],
    );
  }
  if (p.rules.length > 1) {
    const [a, b] = p.rules;
    const fa = byKey.get(a!.field)!, fb = byKey.get(b!.field)!;
    if (a!.field !== b!.field)
      add(
        { id: "PT-MULTI", text: "두 가지 이상 부결 사유에 해당하면 해당 사유를 모두 안내한다", section: "부결 사유" },
        { kind: "rule", subject: "복수 사유", description: `${a!.code}+${b!.code} 동시 위반`, values: [], evidence: "패턴 조합" },
        [{ title: `[복수 부결] ${a!.code}+${b!.code}`, type: "exception", steps: ["두 항목을 동시에 기준 밖으로 입력한다", "심사를 요청한다"], input: describe({ ...base, [a!.field]: failingValue(a!, fa), [b!.field]: failingValue(b!, fb) }), expected: `부결, ${a!.code}·${b!.code} 사유 모두 안내`, rationale: "사유 누락 여부 확인" }],
      );
  }
  const verified = verifyCases(cases, requirements, conditions, []);
  return { requirements, conditions, cases: verified.cases, issues: verified.issues, normalized: requirements.map((r) => `${r.id} ${r.text}`).join("\n") };
}
