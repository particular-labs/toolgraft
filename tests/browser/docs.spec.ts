import { test, expect } from "@playwright/test";
import { helpTopics } from "../../packages/agent-core/src/help";

test("documentation supports topic links, history, mobile navigation and manual setup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5273/docs.html");
  const topics = page.getByRole("navigation", { name: "Documentation topics" });
  for (const topic of helpTopics) {
    await topics.getByRole("link", { name: topic.title, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      topic.title,
    );
    await expect(
      topics.getByRole("link", { name: topic.title, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#help-title")).toBeFocused();
  }
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Manual agent setup",
  );
  await page.getByLabel("Agent client", { exact: true }).selectOption("Codex");
  await expect(page.locator("#managed-config")).toContainText(
    "[mcp_servers.toolgraft]",
  );
  for (const width of [320, 390, 768, 1100]) {
    await page.setViewportSize({ width, height: 844 });
    for (const topic of helpTopics) {
      await page.goto(`http://127.0.0.1:5273/docs.html#${topic.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        topic.title,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (
        [320, 1100].includes(width) &&
        ["start", "manual", "privacy"].includes(topic.id)
      )
        await page.screenshot({
          path: `.cache/screenshots/docs-${topic.id}-${width}.png`,
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(topics).toBeHidden();
  await page.getByRole("button", { name: "Browse documentation" }).click();
  await expect(topics).toBeVisible();
  await topics
    .getByRole("link", { name: "Use website tools", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Use website tools",
  );
  await expect(topics).toBeHidden();
  expect(errors).toEqual([]);
});
