import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("docs/evidence", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const results = [],
  run = Date.now();
async function login(page, name) {
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.getByRole("button", { name, exact: true }).click(),
  ]);
}

try {
  const setupContext = await browser.newContext();
  const setupPage = await setupContext.newPage();
  await setupPage.goto("http://127.0.0.1:3000");
  await login(setupPage, "管理者");
  await setupPage.goto("http://127.0.0.1:3001");
  await setupPage.waitForFunction(() => {
    const text = document.getElementById("status")?.textContent || "";
    return (
      text.includes("自動更新中") || text.includes("イベントが見つかりません")
    );
  });
  if (
    await setupPage
      .getByRole("button", { name: "架空のイベントを準備する" })
      .isVisible()
  ) {
    await setupPage
      .getByRole("button", { name: "架空のイベントを準備する" })
      .click();
    await setupPage
      .getByText("自動更新中 · 3秒ごと", { exact: true })
      .waitFor();
  }
  await setupContext.close();
  for (const width of [1280, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3000");
    await login(page, "参加者 A");
    await page
      .getByLabel("質問本文")
      .fill(`架空の画面検証 ${width}・${run}：最初の一歩は何ですか？`);
    await page.getByRole("button", { name: "質問を投稿する" }).click();
    await page.getByText("投稿しました。ありがとうございます。").waitFor();
    const article = page
      .locator("article")
      .filter({ hasText: `架空の画面検証 ${width}・${run}` });
    await article.waitFor();
    await login(page, "参加者 B");
    const question = page
      .locator("article")
      .filter({ hasText: `架空の画面検証 ${width}・${run}` });
    await question.getByRole("button", { name: "この質問に投票する" }).click();
    await question.getByRole("button", { name: "投票を取り消す" }).waitFor();
    assert.equal(await question.locator("strong").textContent(), "1");
    await page.screenshot({
      path: `docs/evidence/participant-${width}.png`,
      fullPage: true,
    });
    await question.getByRole("button", { name: "投票を取り消す" }).click();
    await question
      .getByRole("button", { name: "この質問に投票する" })
      .waitFor();
    await login(page, "管理者");
    const admin = await context.newPage();
    await admin.goto("http://127.0.0.1:3001");
    const aq = admin
      .locator("article")
      .filter({ hasText: `架空の画面検証 ${width}・${run}` });
    await aq
      .getByRole("button", { name: "回答済みにする", exact: true })
      .click();
    await aq.getByRole("button", { name: "未回答に戻す" }).waitFor();
    await aq.getByRole("button", { name: "強調する", exact: true }).click();
    await aq.getByRole("button", { name: "強調を解除" }).waitFor();
    await question.getByText("回答済み", { exact: true }).waitFor();
    await question.getByText("注目の質問", { exact: true }).waitFor();
    await admin.screenshot({
      path: `docs/evidence/admin-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      post: true,
      vote: true,
      unvote: true,
      answered: true,
      highlight: true,
      automaticUpdate: true,
      noHorizontalOverflow: true,
      pageErrors: errors,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(
  "docs/evidence/browser-results.json",
  JSON.stringify(results, null, 2) + "\n",
);
console.log(JSON.stringify(results));
