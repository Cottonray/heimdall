import type { Action } from "./types.ts";
type ExportSource = {
  engine: string;
  name: string;
  url: string;
  steps: { action: Action; ok?: boolean }[];
};
export function script(source: ExportSource) {
  const q = JSON.stringify;
  if (source.engine === "android")
    return JSON.stringify(
      {
        name: source.name,
        engine: "appium",
        actions: source.steps.map((x) => x.action),
      },
      null,
      2,
    );
  const lines = [
    `import { test, expect } from '@playwright/test';`,
    `test(${q(source.name)}, async ({ page, request }) => {`,
    `  await page.goto(${q(source.url)});`,
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
