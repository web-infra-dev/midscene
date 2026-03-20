/**
 * WebVoyager evaluation runner for Midscene.
 *
 * Usage:
 *   npx tsx packages/evaluation/web-voyager/runner.ts [--subset 30|75] [--headed] [--skip-judge]
 *
 * Required env vars:
 *   MIDSCENE_MODEL_NAME, MIDSCENE_MODEL_BASE_URL, MIDSCENE_MODEL_API_KEY
 *
 * Optional env vars:
 *   MIDSCENE_JUDGE_API_KEY, MIDSCENE_JUDGE_BASE_URL - for the judge model
 *   MIDSCENE_JUDGE_MODEL - judge model name (default: gpt-4o)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Load env from repo root
dotenv.config({
  path: path.join(__dirname, '../../../.env'),
  override: true,
});

import { globalModelConfigManager } from '@midscene/shared/env';
import { PlaywrightAgent } from '@midscene/web/playwright';
import { chromium } from 'playwright';
import { WEBVOYAGER_SUBSET_30, WEBVOYAGER_SUBSET_75 } from './dataset';
import { judgeTask } from './judge';
import type {
  EvalConfig,
  EvalSummary,
  TaskResult,
  WebVoyagerTask,
} from './types';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (name: string) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const config: EvalConfig = {
  subset: (getArg('subset') as '30' | '75') || '30',
  taskTimeoutMs: Number(getArg('timeout')) || 600_000, // 10 min per task
  maxReplanningCycles: Number(getArg('max-cycles')) || 50,
  viewport: { width: 1280, height: 900 },
  headless: !hasFlag('headed'),
  judgeModel:
    getArg('judge-model') ||
    process.env.MIDSCENE_JUDGE_MODEL ||
    process.env.MIDSCENE_MODEL_NAME ||
    'gpt-4o',
  outputDir: getArg('output') || path.join(__dirname, 'results'),
  screenshotShrinkFactor: Number(getArg('shrink')) || 1,
};

const skipJudge = hasFlag('skip-judge');
const onlyTask = getArg('only'); // run a single task by id
const trials = Number(getArg('trials')) || 1; // run each task N times, take best

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getDataset(): WebVoyagerTask[] {
  const dataset =
    config.subset === '75' ? WEBVOYAGER_SUBSET_75 : WEBVOYAGER_SUBSET_30;
  if (onlyTask) {
    return dataset.filter((t) => t.id === onlyTask);
  }
  return dataset;
}

function extractTokenUsage(dumpStr: string): {
  inputTokens: number;
  outputTokens: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const dump = JSON.parse(dumpStr);
    const executions = dump?.executions || [];
    for (const exec of executions) {
      const tasks = exec?.tasks || [];
      for (const task of tasks) {
        const usage = task?.usage;
        if (usage) {
          inputTokens += usage.prompt_tokens || usage.input_tokens || 0;
          outputTokens += usage.completion_tokens || usage.output_tokens || 0;
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  return { inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// Run a single task
// ---------------------------------------------------------------------------
async function runTask(task: WebVoyagerTask): Promise<TaskResult> {
  const startTime = Date.now();
  const result: TaskResult = {
    taskId: task.id,
    webName: task.web_name,
    question: task.ques,
    agentAnswer: null,
    finalScreenshot: null,
    screenshots: [],
    success: null,
    judgeVerdict: null,
    judgeReason: null,
    error: null,
    totalSteps: 0,
    totalTimeMs: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    estimatedCostUsd: 0,
  };

  let browser: any = null;
  let agent: PlaywrightAgent | null = null;
  let page: any = null;

  try {
    console.log(`\n[${'='.repeat(60)}]`);
    console.log(`Running: ${task.id} - ${task.web_name}`);
    console.log(`Question: ${task.ques.slice(0, 100)}...`);

    browser = await chromium.launch({
      headless: config.headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
    });
    const context = await browser.newContext({
      viewport: {
        width: config.viewport.width,
        height: config.viewport.height,
      },
    });
    // Increase default timeout for navigation and screenshots
    context.setDefaultTimeout(60000);
    context.setDefaultNavigationTimeout(60000);
    page = await context.newPage();
    await page.goto(task.web, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    agent = new PlaywrightAgent(page, {
      testId: task.id,
      generateReport: true,
      reportFileName: `webvoyager-${task.id}`,
      replanningCycleLimit: config.maxReplanningCycles,
      screenshotShrinkFactor: config.screenshotShrinkFactor,
    });

    // Give the page time to load
    await new Promise((r) => setTimeout(r, 3000));

    // Execute the task using aiAct with a combined prompt
    const taskPrompt = `You are browsing the web to complete a task. Here is the task:

${task.ques}

Navigate the website, interact with elements, and find the answer. When you have found the answer, output it clearly.`;

    const answer = await Promise.race([
      agent.aiAct(taskPrompt),
      new Promise<string>((_, reject) =>
        setTimeout(
          () => reject(new Error('Task timeout')),
          config.taskTimeoutMs,
        ),
      ),
    ]);

    result.agentAnswer = answer || null;
  } catch (err: any) {
    result.error = err.message || String(err);
    console.error(`  Error: ${result.error}`);
  }

  // Always try to collect metrics and screenshot, even after error
  if (agent) {
    try {
      const dumpStr = agent.dumpDataString();
      const { inputTokens, outputTokens } = extractTokenUsage(dumpStr);
      result.tokenUsage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      };

      const dump = JSON.parse(dumpStr);
      let steps = 0;
      for (const exec of dump?.executions || []) {
        steps += (exec?.tasks || []).length;
      }
      result.totalSteps = steps;
    } catch {
      // ignore
    }

    try {
      await agent.destroy();
    } catch {
      // ignore
    }
  }

  if (page) {
    try {
      const screenshotBuffer = await page.screenshot();
      const screenshotBase64 = screenshotBuffer.toString('base64');
      result.finalScreenshot = screenshotBase64;
      result.screenshots.push(screenshotBase64);
    } catch {
      // ignore screenshot errors
    }
  }

  // Clean up browser
  if (browser) {
    try {
      await browser.close();
    } catch {
      // ignore cleanup errors
    }
  }

  result.totalTimeMs = Date.now() - startTime;

  // Estimate cost (rough, based on typical VLM pricing)
  // Qwen VL: ~$0.003/1K input, ~$0.009/1K output
  result.estimatedCostUsd =
    (result.tokenUsage.inputTokens / 1000) * 0.003 +
    (result.tokenUsage.outputTokens / 1000) * 0.009;

  console.log(
    `  Done in ${(result.totalTimeMs / 1000).toFixed(1)}s | Steps: ${result.totalSteps} | Tokens: ${result.tokenUsage.totalTokens} | Answer: ${(result.agentAnswer || '(none)').slice(0, 80)}`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Judge results
// ---------------------------------------------------------------------------
async function judgeResults(results: TaskResult[]): Promise<void> {
  console.log(
    `\nJudging ${results.length} results with ${config.judgeModel}...`,
  );

  for (const result of results) {
    if (result.error) {
      result.judgeVerdict = 'NOT_SUCCESS';
      result.judgeReason = `Agent error: ${result.error}`;
      result.success = false;
      continue;
    }

    try {
      const { verdict, reason } = await judgeTask({
        question: result.question,
        agentAnswer: result.agentAnswer,
        screenshots: result.finalScreenshot ? [result.finalScreenshot] : [],
        judgeModel: config.judgeModel,
      });

      result.judgeVerdict = verdict;
      result.judgeReason = reason;
      result.success = verdict === 'SUCCESS';

      console.log(`  ${result.taskId}: ${verdict} - ${reason.slice(0, 80)}`);
    } catch (err: any) {
      result.judgeVerdict = null;
      result.judgeReason = `Judge error: ${err.message}`;
      result.success = null;
      console.error(`  ${result.taskId}: Judge failed - ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Generate summary
// ---------------------------------------------------------------------------
function generateSummary(results: TaskResult[]): EvalSummary {
  const modelConfig = globalModelConfigManager.getModelConfig('default');

  const judged = results.filter((r) => r.success !== null);
  const successCount = judged.filter((r) => r.success).length;
  const failCount = judged.filter((r) => r.success === false).length;
  const errorCount = results.filter((r) => r.error).length;

  // Per-website stats
  const perWebsite: EvalSummary['perWebsite'] = {};
  for (const r of results) {
    if (!perWebsite[r.webName]) {
      perWebsite[r.webName] = {
        total: 0,
        success: 0,
        successRate: 0,
        avgSteps: 0,
        avgTimeMs: 0,
        avgTokens: 0,
      };
    }
    const ws = perWebsite[r.webName];
    ws.total++;
    if (r.success) ws.success++;
    ws.avgSteps += r.totalSteps;
    ws.avgTimeMs += r.totalTimeMs;
    ws.avgTokens += r.tokenUsage.totalTokens;
  }
  for (const ws of Object.values(perWebsite)) {
    ws.successRate = ws.total > 0 ? ws.success / ws.total : 0;
    ws.avgSteps = ws.total > 0 ? ws.avgSteps / ws.total : 0;
    ws.avgTimeMs = ws.total > 0 ? ws.avgTimeMs / ws.total : 0;
    ws.avgTokens = ws.total > 0 ? ws.avgTokens / ws.total : 0;
  }

  const totalInputTokens = results.reduce(
    (s, r) => s + r.tokenUsage.inputTokens,
    0,
  );
  const totalOutputTokens = results.reduce(
    (s, r) => s + r.tokenUsage.outputTokens,
    0,
  );

  return {
    framework: 'midscene',
    modelName: modelConfig.modelName || 'unknown',
    modelFamily: modelConfig.modelFamily || 'unknown',
    timestamp: new Date().toISOString(),
    config,
    totalTasks: results.length,
    completedTasks: results.filter((r) => !r.error).length,
    successCount,
    failCount,
    errorCount,
    successRate: judged.length > 0 ? successCount / judged.length : 0,
    avgSteps:
      results.length > 0
        ? results.reduce((s, r) => s + r.totalSteps, 0) / results.length
        : 0,
    avgTimeMs:
      results.length > 0
        ? results.reduce((s, r) => s + r.totalTimeMs, 0) / results.length
        : 0,
    avgInputTokens: results.length > 0 ? totalInputTokens / results.length : 0,
    avgOutputTokens:
      results.length > 0 ? totalOutputTokens / results.length : 0,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd: results.reduce((s, r) => s + r.estimatedCostUsd, 0),
    perWebsite,
    results,
  };
}

function printSummary(summary: EvalSummary): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('WEBVOYAGER EVALUATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Model: ${summary.modelName} (${summary.modelFamily})`);
  console.log(`Time: ${summary.timestamp}`);
  console.log(`Tasks: ${summary.totalTasks} (subset: ${config.subset})`);
  console.log('');
  console.log(
    `Success Rate: ${(summary.successRate * 100).toFixed(1)}% (${summary.successCount}/${summary.completedTasks})`,
  );
  console.log(`Errors: ${summary.errorCount}`);
  console.log(`Avg Steps: ${summary.avgSteps.toFixed(1)}`);
  console.log(`Avg Time: ${(summary.avgTimeMs / 1000).toFixed(1)}s`);
  console.log(
    `Avg Tokens: ${summary.avgInputTokens.toFixed(0)} in / ${summary.avgOutputTokens.toFixed(0)} out`,
  );
  console.log(
    `Total Tokens: ${summary.totalInputTokens} in / ${summary.totalOutputTokens} out`,
  );
  console.log(`Estimated Cost: $${summary.totalCostUsd.toFixed(2)}`);

  console.log('\nPer-Website Results:');
  console.log('─'.repeat(70));
  console.log(
    `${'Website'.padEnd(22)} ${'Success'.padEnd(12)} ${'Rate'.padEnd(8)} ${'Steps'.padEnd(8)} ${'Time'.padEnd(10)} ${'Tokens'.padEnd(10)}`,
  );
  console.log('─'.repeat(70));
  for (const [name, ws] of Object.entries(summary.perWebsite)) {
    console.log(
      `${name.padEnd(22)} ${`${ws.success}/${ws.total}`.padEnd(12)} ${(ws.successRate * 100).toFixed(0).padStart(3)}%    ${ws.avgSteps.toFixed(1).padStart(5)}   ${(ws.avgTimeMs / 1000).toFixed(0).padStart(5)}s   ${ws.avgTokens.toFixed(0).padStart(8)}`,
    );
  }
  console.log('─'.repeat(70));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dataset = getDataset();

  console.log('WebVoyager Evaluation Runner');
  console.log(`Subset: ${config.subset} (${dataset.length} tasks)`);
  console.log(`Trials: ${trials}`);
  console.log(`Headless: ${config.headless}`);
  console.log(`Judge: ${skipJudge ? 'SKIPPED' : config.judgeModel}`);
  console.log(`Timeout: ${config.taskTimeoutMs / 1000}s per task`);

  const modelConfig = globalModelConfigManager.getModelConfig('default');
  console.log(`Model: ${modelConfig.modelName} (${modelConfig.modelFamily})`);

  // Ensure output dir exists
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }

  // Helper: check if a result is a real success (not "unable to" answers)
  const isRealSuccess = (r: TaskResult): boolean => {
    if (r.error) return false;
    const ans = (r.agentAnswer || '').toLowerCase();
    if (
      ans.includes('unable to') ||
      ans.includes('was unable') ||
      ans.includes('could not complete')
    )
      return false;
    return true;
  };

  // Run tasks sequentially, with retries
  const results: TaskResult[] = [];
  for (let i = 0; i < dataset.length; i++) {
    const task = dataset[i];
    console.log(`\n[${i + 1}/${dataset.length}] ${task.id}`);

    let bestResult: TaskResult | null = null;

    for (let trial = 1; trial <= trials; trial++) {
      if (trials > 1) console.log(`  Trial ${trial}/${trials}`);

      const result = await runTask(task);

      // Keep the best result: success > failure, lower token > higher token
      if (
        !bestResult ||
        (!isRealSuccess(bestResult) && isRealSuccess(result))
      ) {
        bestResult = result;
      } else if (isRealSuccess(bestResult) && isRealSuccess(result)) {
        // Both success: keep the one with fewer tokens
        if (result.tokenUsage.totalTokens < bestResult.tokenUsage.totalTokens) {
          bestResult = result;
        }
      }

      // If we got a real success, no need to retry
      if (isRealSuccess(result)) {
        if (trials > 1)
          console.log(
            `  ✅ Succeeded on trial ${trial}, skipping remaining trials`,
          );
        break;
      }
    }

    results.push(bestResult!);

    // Save intermediate results (without screenshots to save space)
    const intermediateResults = results.map((r) => ({
      ...r,
      finalScreenshot: null,
      screenshots: [],
    }));
    writeFileSync(
      path.join(config.outputDir, 'results-intermediate.json'),
      JSON.stringify(intermediateResults, null, 2),
    );
  }

  // Judge
  if (!skipJudge) {
    await judgeResults(results);
  }

  // Generate and print summary
  const summary = generateSummary(results);
  printSummary(summary);

  // Save full results (strip screenshots for file size)
  const saveable = {
    ...summary,
    results: summary.results.map((r) => ({
      ...r,
      finalScreenshot: r.finalScreenshot ? '(base64 omitted)' : null,
      screenshots: [],
    })),
  };
  const outputPath = path.join(
    config.outputDir,
    `eval-${summary.modelName}-${config.subset}-${Date.now()}.json`,
  );
  writeFileSync(outputPath, JSON.stringify(saveable, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
