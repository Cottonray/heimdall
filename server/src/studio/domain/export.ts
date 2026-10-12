import type { Action } from "../../../../contracts/studio.ts";
type ExportSource = {
  engine: string;
  name: string;
  url: string;
  steps: { action: Action; ok?: boolean }[];
};
export function script(source: ExportSource) {
  const q = JSON.stringify;
  if (source.engine === "android") return appiumScript(source);
  const lines = [
    `import { test, expect } from '@playwright/test';`,
    `test(${q(source.name)}, async ({ page, request }) => {`,
    ...(source.engine === "api"
      ? []
      : [`  await page.goto(${q(source.url)});`]),
  ];
  for (const { action: a } of source.steps) {
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
  }
  return lines.concat("});").join("\n");
}

function appiumScript(source: ExportSource) {
  const q = JSON.stringify;
  const lines = [
    'import { remote } from "webdriverio";',
    'import assert from "node:assert/strict";',
    "// Set APPIUM_URL and ANDROID_UDID for your test device.",
    'const endpoint = new URL(process.env.APPIUM_URL || "http://127.0.0.1:4723");',
    'const driver = await remote({ hostname: endpoint.hostname, port: Number(endpoint.port || 4723), path: endpoint.pathname, capabilities: { platformName: "Android", "appium:automationName": "UiAutomator2", "appium:udid": process.env.ANDROID_UDID, "appium:noReset": true } });',
    "try {",
  ];
  for (const { action: a } of source.steps) {
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
  }
  return lines
    .concat("} finally {", "  await driver.deleteSession();", "}")
    .join("\n");
}
