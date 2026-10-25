import type { Action, ScenarioPlan } from "../../../../contracts/studio.ts";
type ExportSource = {
  appPackage?: string;
  plan?: ScenarioPlan;
  engine: string;
  name: string;
  url: string;
  steps: { action: Action; ok?: boolean }[];
};
function rawScript(source: ExportSource, options: { stepsOnly?: boolean } = {}) {
  const q = JSON.stringify;
  if (source.plan) return "// 소스 기반 시나리오 초안 · 미실행\nexport const scenarioPlan = " + q(source.plan, null, 2) + ";\n";
  if (source.engine === "android") return appiumScript(source, options.stepsOnly);
  const lines = options.stepsOnly ? [] : [
    `import { test, expect } from '@playwright/test';`,
    `test(${q(source.name)}, async ({ page, request }) => {`,
    ...(source.engine === "api"
      ? []
      : [`  await page.goto(${q(source.url)});`]),
  ];
  for (const { action: a } of source.steps) {
    const start = lines.length;
    const loc = a.selector
      ? `page.locator(${q(a.selector)}).first()`
      : `page.getByText(${q(a.text)}, { exact: true }).first()`;
    if (a.type === "click") lines.push(`  await ${loc}.click();`);
    if (a.type === "fill") lines.push(`  await ${loc}.fill(${q(a.value)});`);
    if (a.type === "type")
      lines.push(`  await page.keyboard.insertText(${q(a.value)});`);
    if (a.type === "point")
      lines.push(`  await page.mouse.click(${a.x}, ${a.y});`);
    if (a.type === "key")
      lines.push(`  await page.keyboard.press(${q(a.key)});`);
    if (a.type === "scroll")
      lines.push(
        `  await page.mouse.wheel(0, ${a.direction === "up" ? -550 : 550});`,
      );
    if (a.type === "goto") lines.push(`  await page.goto(${q(a.url)});`);
    if (a.type === "assert")
      lines.push(
        `  await expect(${a.text ? `page.getByText(${q(a.text)}, { exact: false }).first()` : loc}).toBeVisible();`,
      );
    if (a.type === "api") {
      lines.push(
        `  { const response = await request.get(${q(a.url)}, { maxRedirects: 0 });`,
        `    expect(response.status()).toBe(${Number(a.status ?? 200)});`,
      );
      if (a.contains)
        lines.push(
          `    expect(await response.text()).toContain(${q(a.contains)});`,
        );
      lines.push("  }");
    }
    for (let i = start; i < lines.length; i++) lines[i] += " // " + actionComment(a);
  }
  return options.stepsOnly
    ? lines.map((line) => line.replace(/^  /, "")).join("\n") || "// 기록된 동작이 없어요."
    : lines.concat("});").join("\n");
}

function appiumScript(source: ExportSource, stepsOnly = false) {
  const q = JSON.stringify;
  const lines = stepsOnly ? [] : [
    'import { remote } from "webdriverio";',
    'import assert from "node:assert/strict";',
    "// Set APPIUM_URL and ANDROID_UDID for your test device.",
    'const endpoint = new URL(process.env.APPIUM_URL || "http://127.0.0.1:4723");',
    'const driver = await remote({ hostname: endpoint.hostname, port: Number(endpoint.port || 4723), path: endpoint.pathname, capabilities: { platformName: "Android", "appium:automationName": "UiAutomator2", "appium:udid": process.env.ANDROID_UDID, "appium:noReset": true } });',
    "try {",
    ...(source.appPackage ? [`  await driver.activateApp(${q(source.appPackage)});`] : []),
  ];
  for (const { action: a } of source.steps) {
    const start = lines.length;
    const selector = a.selector
      ? "id=" + a.selector
      : "android=new UiSelector().text(" + q(a.text || "") + ")";
    const el = "driver.$(" + q(selector) + ")";
    if (a.type === "click") lines.push("  await " + el + ".click();");
    else if (a.type === "fill")
      lines.push("  await " + el + ".setValue(" + q(a.value || "") + ");");
    else if (a.type === "type")
      lines.push("  await driver.keys(" + q(a.value || "") + ");");
    else if (a.type === "key")
      lines.push(
        a.key === "Back"
          ? "  await driver.back();"
          : "  await driver.pressKeyCode(66);",
      );
    else if (a.type === "point")
      lines.push(
        '  await driver.execute("mobile: clickGesture", { x: ' +
          Number(a.x) +
          ", y: " +
          Number(a.y) +
          " });",
      );
    else if (a.type === "scroll")
      lines.push(
        '  { const { width, height } = await driver.getWindowRect(); await driver.execute("mobile: swipeGesture", { left: 0, top: 0, width, height, direction: ' +
          q(a.direction === "up" ? "down" : "up") +
          ", percent: 0.6 }); }",
      );
    else if (a.type === "assert")
      lines.push(
        "  assert.ok(await " +
          el +
          ".isExisting(), " +
          q(a.text || a.selector || "element") +
          ");",
      );
    else
      lines.push(
        "  throw new Error(" +
          q("Unsupported Android action: " + a.type) +
          ");",
      );
    for (let i = start; i < lines.length; i++) lines[i] += " // " + actionComment(a);
  }
  if (stepsOnly) return lines.map((line) => line.replace(/^  /, "")).join("\n") || "// 기록된 동작이 없어요.";
  return lines
    .concat("} finally {", "  await driver.deleteSession();", "}")
    .join("\n");
}

function actionComment(a: Action) {
  const target = a.text || a.selector || "대상 요소";
  const descriptions: Record<string, string> = { click: target + " 선택", fill: target + "에 테스트 값 입력", type: "선택한 입력칸에 텍스트 입력", point: "지정 좌표 선택", key: (a.key || "키") + " 입력", scroll: (a.direction === "up" ? "위" : "아래") + "로 스크롤", goto: "테스트 주소로 이동", assert: target + " 표시 여부 검증", api: "API 응답 상태와 내용 검증" };
  return String(a.comment || descriptions[a.type] || "테스트 동작 수행").replace(/[\r\n\u2028\u2029]/g, " ").slice(0, 300);
}
export function script(source: ExportSource, options: { stepsOnly?: boolean } = {}) {
  return rawScript(source, options).split("\n").map(line => {
    if (!line.trim() || line.trim().startsWith("//") || line.includes(" // ")) return line;
    const note = line.includes("import ") ? "테스트 라이브러리 불러오기" : line.includes("deleteSession") ? "기기 연결 정리" : line.includes("activateApp") ? "테스트 앱 실행" : line.includes("page.goto") ? "시작 화면 열기" : line.includes("remote(") || line.includes("endpoint =") ? "테스트 기기 연결 설정" : "테스트 실행 범위 구성";
    return line + " // " + note;
  }).join("\n");
}
