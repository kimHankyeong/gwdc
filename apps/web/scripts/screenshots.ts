import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const output = path.join(root, "artifacts/screenshots");
const baseUrl = process.env.DEMO_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
const waitForTerminal = async (targetPage: Page) => {
  await targetPage.getByTestId("order-stage").waitFor({ state: "visible", timeout: 10_000 });
  await targetPage.waitForFunction(() => {
    const stage = document.querySelector('[data-testid="order-stage"]');
    return stage && /가상 결제 완료|승인 범위 초과|처리 실패/.test(stage.textContent || "");
  }, { timeout: 15_000 });
  await targetPage.waitForTimeout(300);
};

try {
  await mkdir(output, { recursive: true });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /본사 운영팀/ }).click();
  const reset = await page.evaluate(async () => { const response = await fetch("/api/policies", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ branchId: "branch-02", budget: 1_000_000, supplierIds: ["fresh-first", "market-one"], expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }) }); return { ok: response.ok, status: response.status, body: await response.text() }; });
  if (!reset.ok) throw new Error(`Screenshot fixture policy reset failed (${reset.status}).`);
  await page.getByTitle("로그아웃").click();
  await page.getByRole("button", { name: /성수 2호점/ }).click();
  await page.getByTestId("provider-select").selectOption("demo");
  await page.getByTestId("qty-onion").fill("3");
  await page.getByTestId("submit-order").click();
  await waitForTerminal(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, "01-order-success.png"), fullPage: true });

  await page.getByTestId("qty-onion").fill("0");
  await page.getByTestId("qty-chicken").fill("115");
  await page.getByTestId("submit-order").click();
  await waitForTerminal(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, "02-order-blocked.png"), fullPage: true });

  await page.getByTitle("로그아웃").click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /본사 운영팀/ }).click();
  await page.getByRole("button", { name: /승인 정책/ }).click();
  await page.getByTestId("policy-branch").selectOption("branch-02");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, "00-headquarters-policy.png"), fullPage: true });
  await page.getByTestId("stop-agent").click();
  await page.getByTestId("confirm-stop").click();
  await page.getByText("중단", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByTitle("로그아웃").click();
  await page.getByRole("button", { name: /성수 2호점/ }).click();
  await page.waitForFunction(() => (document.querySelector('[data-testid="submit-order"]') as HTMLButtonElement | null)?.disabled === true, { timeout: 10_000 });
  await page.waitForTimeout(3_300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, "03-agent-stopped.png"), fullPage: true });

  console.log(`Saved UI screenshots to ${output}`);
} finally {
  await browser.close();
}
