import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const svg = await readFile("packages/brand/assets/icon.svg", "utf8");
const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 2,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
    );
    await page.screenshot({
      path: `packages/brand/assets/icon-${size}.png`,
      omitBackground: true,
      scale: "css",
    });
    await page.close();
  }
} finally {
  await browser.close();
}
