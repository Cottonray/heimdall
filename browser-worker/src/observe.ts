import type { Page } from "playwright";
export async function observe(page: Page) {
  return {
    url: page.url(),
    title: await page.title(),
    tree: (await page.locator("body").ariaSnapshot()).slice(0, 18000),
    elements: await page
      .locator("input,textarea,button,a,select,[role],[data-testid]")
      .evaluateAll((nodes) =>
        nodes.slice(0, 80).map((el) => ({
          text: el.textContent?.trim().slice(0, 100),
          selector: el.id ? "#" + CSS.escape(el.id) : undefined,
          placeholder: el.getAttribute("placeholder"),
          label: el.getAttribute("aria-label"),
        })),
      ),
  };
}
