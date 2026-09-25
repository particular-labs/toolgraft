import { expect, type Page } from "@playwright/test";
/** Real extension DOM at narrow, phone, tablet and desktop CSS widths. */
export async function checkExtensionLayout(page: Page, name: string) {
  if (await page.locator("#app").count())
    await expect(page.locator("#app")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 768, 1100]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator("dialog[open]").evaluateAll((ds) =>
      ds.forEach((d) => {
        d.scrollTop = 0;
      }),
    );
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      clipped: [...document.querySelectorAll("button,input,select,summary")]
        .filter((e) => e.getClientRects().length)
        .flatMap((e) => {
          const r = e.getBoundingClientRect();
          return r.left < -1 || r.right > innerWidth + 1
            ? [
                {
                  tag: e.tagName,
                  text: (e.textContent ?? "").slice(0, 80),
                  left: r.left,
                  right: r.right,
                },
              ]
            : [];
        }),
    }));
    expect
      .soft(layout.scroll, `${name} at ${width}px overflows`)
      .toBeLessThanOrEqual(width);
    expect
      .soft(layout.clipped, `${name} at ${width}px clips controls`)
      .toEqual([]);
    if (width === 320 || width === 1100)
      await page.screenshot({
        path: `.cache/screenshots/responsive/${name}-${width}.png`,
        fullPage: (await page.locator("dialog[open]").count()) === 0,
      });
  }
}

/** Stress valid unbroken labels without changing the underlying adapter or request. */
export async function checkLongContentLayout(page: Page, name: string) {
  const labels = page.locator("h1,h2,h3,.tool-review strong");
  const original = await labels.allTextContents();
  await labels.evaluateAll((nodes) =>
    nodes.forEach((node, i) => {
      node.textContent = (i ? "tool_" : "Adapter").padEnd(i ? 64 : 100, "x");
    }),
  );
  await checkExtensionLayout(page, `${name}-long-labels`);
  await labels.evaluateAll(
    (nodes, values) =>
      nodes.forEach((node, i) => {
        node.textContent = values[i]!;
      }),
    original,
  );
}
