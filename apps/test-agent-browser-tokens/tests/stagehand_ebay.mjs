import { Stagehand } from "@browserbasehq/stagehand";

function getProxyConfig() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return undefined;
  try {
    const url = new URL(proxyUrl);
    return {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch {
    return undefined;
  }
}

const proxyConfig = getProxyConfig();

const stagehand = new Stagehand({
  env: "LOCAL",
  modelName: "openai/qwen3.5-plus",
  modelClientOptions: {
    apiKey: process.env.MIDSCENE_MODEL_API_KEY?.replace(/"/g, "") || process.env.OPENAI_API_KEY || "",
    baseURL: process.env.MIDSCENE_MODEL_BASE_URL?.replace(/"/g, "") || process.env.OPENAI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    timeout: 300000,
  },
  localBrowserLaunchOptions: {
    headless: true,
    chromiumSandbox: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--ignore-certificate-errors",
    ],
    executablePath:
      process.env.CHROME_PATH ||
      "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
    proxy: proxyConfig,
  },
  verbose: 1,
});

console.log("\n========================================");
console.log("Stagehand: open ebay.com, search for headphones");
console.log("========================================\n");

await stagehand.init();
const page = stagehand.context.pages()[0];
const startTime = Date.now();

await page.goto("https://www.ebay.com", {
  waitUntil: "networkidle",
  timeout: 60000,
});

await stagehand.act('在搜索框中输入"耳机"，然后点击搜索按钮');
await page.waitForTimeout(3000);

const endTime = Date.now();
const totalTime = (endTime - startTime) / 1000;
const m = stagehand.metrics;

console.log("\n========================================");
console.log("Token Usage Breakdown");
console.log("========================================\n");

console.log("Act operations:");
console.log(`  Prompt tokens:     ${m.actPromptTokens}`);
console.log(`  Completion tokens: ${m.actCompletionTokens}`);
console.log(`  Reasoning tokens:  ${m.actReasoningTokens}`);
console.log(`  Cached input:      ${m.actCachedInputTokens}`);
console.log(`  Inference time:    ${m.actInferenceTimeMs}ms`);

console.log("\nObserve operations:");
console.log(`  Prompt tokens:     ${m.observePromptTokens}`);
console.log(`  Completion tokens: ${m.observeCompletionTokens}`);

console.log("\nAgent operations:");
console.log(`  Prompt tokens:     ${m.agentPromptTokens}`);
console.log(`  Completion tokens: ${m.agentCompletionTokens}`);

console.log("\n========================================");
console.log("TOTAL TOKEN USAGE SUMMARY");
console.log("========================================");
console.log(`Total prompt tokens:     ${m.totalPromptTokens}`);
console.log(`Total completion tokens: ${m.totalCompletionTokens}`);
console.log(
  `Total tokens:            ${m.totalPromptTokens + m.totalCompletionTokens}`,
);
console.log(`Total reasoning tokens:  ${m.totalReasoningTokens}`);
console.log(`Total cached input:      ${m.totalCachedInputTokens}`);
console.log(`Total inference time:    ${m.totalInferenceTimeMs}ms`);
console.log(`Total wall time:         ${totalTime.toFixed(1)}s`);
console.log("========================================\n");

await stagehand.close();
