/**
 * Stagehand + Qwen 3.5 VL runner for WebVoyager benchmark.
 *
 * This file is designed to be copied into the stagehand repo root and run there.
 *
 * Usage:
 *   npx tsx run_qwen.ts [--only <task-id>] [--skip-judge] [--max-steps 50]
 *
 * Required env vars:
 *   QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL_NAME
 *
 * Optional env vars:
 *   JUDGE_API_KEY, JUDGE_BASE_URL, JUDGE_MODEL
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// When running inside the stagehand repo, use relative import
import { Stagehand } from './packages/core/dist/esm/index.js';
// OpenAI is loaded dynamically only when judge is needed
type OpenAIType = typeof import('openai').default;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Same 30-task subset as Midscene and Browser Use runners
// ---------------------------------------------------------------------------
const SUBSET_30 = [
  {
    id: 'Allrecipes--3',
    web_name: 'Allrecipes',
    web: 'https://www.allrecipes.com/',
    ques: 'Search for a recipe of Beef Wellington on Allrecipes that has more than 200 reviews and a rating of at least 4.5 stars. List the main ingredients required for the recipe.',
  },
  {
    id: 'Allrecipes--10',
    web_name: 'Allrecipes',
    web: 'https://www.allrecipes.com/',
    ques: 'I want to make vegetarian lasagna, find a recipe that has a rating of 4 stars or more and uses zucchini as one of the ingredients.',
  },
  {
    id: 'Amazon--10',
    web_name: 'Amazon',
    web: 'https://www.amazon.com/',
    ques: 'Find the cost of a 2-year protection plan for a PS4 on Amazon.',
  },
  {
    id: 'Amazon--20',
    web_name: 'Amazon',
    web: 'https://www.amazon.com/',
    ques: 'Search for a wireless ergonomic keyboard with backlighting on Amazon. Filter the results to show only items with a rating of 4 stars and above, priced between $40 and $60.',
  },
  {
    id: 'Apple--5',
    web_name: 'Apple',
    web: 'https://www.apple.com/',
    ques: 'How much does it cost to buy a MacBook Pro 16-inch with M3 Max chip, 16-core CPU, 40-core GPU, 64GB memory, and 1TB SSD on the Apple website?',
  },
  {
    id: 'Apple--15',
    web_name: 'Apple',
    web: 'https://www.apple.com/',
    ques: 'Tell me about the trade-in value of an iPhone 13 Pro Max on the Apple website.',
  },
  {
    id: 'ArXiv--5',
    web_name: 'ArXiv',
    web: 'https://arxiv.org/',
    ques: 'Find the paper "Attention Is All You Need" on ArXiv and tell me how many citations it has according to Semantic Scholar (linked from the ArXiv page).',
  },
  {
    id: 'ArXiv--15',
    web_name: 'ArXiv',
    web: 'https://arxiv.org/',
    ques: 'Search for the paper titled "GPT-4 Technical Report" on ArXiv. Tell me when version 3 of this paper was submitted.',
  },
  {
    id: 'BBC News--5',
    web_name: 'BBC News',
    web: 'https://www.bbc.com/news',
    ques: 'Find the latest headlines under the "Technology" section on BBC News.',
  },
  {
    id: 'BBC News--20',
    web_name: 'BBC News',
    web: 'https://www.bbc.com/news',
    ques: 'Find a BBC News article about climate change. Summarize the key points of the article.',
  },
  {
    id: 'Cambridge Dictionary--5',
    web_name: 'Cambridge Dictionary',
    web: 'https://dictionary.cambridge.org/',
    ques: 'Look up the word "sustainability" in the Cambridge Dictionary and provide its pronunciation and definition.',
  },
  {
    id: 'Cambridge Dictionary--15',
    web_name: 'Cambridge Dictionary',
    web: 'https://dictionary.cambridge.org/',
    ques: 'Find three different meanings of the word "dog" in the Cambridge Dictionary.',
  },
  {
    id: 'Coursera--5',
    web_name: 'Coursera',
    web: 'https://www.coursera.org/',
    ques: 'Find a course on Coursera that teaches Python for beginners. Provide the course name, duration, and rating.',
  },
  {
    id: 'Coursera--20',
    web_name: 'Coursera',
    web: 'https://www.coursera.org/',
    ques: 'Search for machine learning courses on Coursera offered by Stanford University. List the available courses.',
  },
  {
    id: 'ESPN--10',
    web_name: 'ESPN',
    web: 'https://www.espn.com/',
    ques: "Check out LeBron James' Stats on ESPN to see how many games he has played in his career.",
  },
  {
    id: 'ESPN--25',
    web_name: 'ESPN',
    web: 'https://www.espn.com/',
    ques: 'Find the current NBA standings on ESPN. Which team is at the top of the Eastern Conference?',
  },
  {
    id: 'GitHub--5',
    web_name: 'GitHub',
    web: 'https://github.com/',
    ques: 'Search for the repository "facebook/react" on GitHub and tell me the number of stars it has.',
  },
  {
    id: 'GitHub--15',
    web_name: 'GitHub',
    web: 'https://github.com/',
    ques: 'Find the latest release of the "microsoft/vscode" repository on GitHub. What is the version number?',
  },
  {
    id: 'Google Map--5',
    web_name: 'Google Map',
    web: 'https://www.google.com/maps/',
    ques: 'Find the distance by car from San Francisco to Los Angeles using Google Maps.',
  },
  {
    id: 'Google Map--20',
    web_name: 'Google Map',
    web: 'https://www.google.com/maps/',
    ques: 'Search for Chinese restaurants near Times Square in New York on Google Maps. Find one that has a rating of 4 stars or more.',
  },
  {
    id: 'Google Search--5',
    web_name: 'Google Search',
    web: 'https://www.google.com/',
    ques: 'What is the population of Tokyo, Japan according to a Google Search?',
  },
  {
    id: 'Google Search--20',
    web_name: 'Google Search',
    web: 'https://www.google.com/',
    ques: 'What is the current exchange rate of US Dollar to Euro according to Google Search?',
  },
  {
    id: 'Huggingface--5',
    web_name: 'Huggingface',
    web: 'https://huggingface.co/',
    ques: 'Find the model "meta-llama/Llama-2-7b" on Hugging Face. How many downloads does it have?',
  },
  {
    id: 'Huggingface--20',
    web_name: 'Huggingface',
    web: 'https://huggingface.co/',
    ques: 'Search for text-to-image models on Hugging Face. Which model has the most likes?',
  },
  {
    id: 'Wolfram Alpha--5',
    web_name: 'Wolfram Alpha',
    web: 'https://www.wolframalpha.com/',
    ques: 'What is the integral of x^2 * sin(x) according to Wolfram Alpha?',
  },
  {
    id: 'Wolfram Alpha--20',
    web_name: 'Wolfram Alpha',
    web: 'https://www.wolframalpha.com/',
    ques: 'Ask Wolfram Alpha: What is the distance from Earth to Mars?',
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TaskResult {
  taskId: string;
  webName: string;
  question: string;
  agentAnswer: string | null;
  screenshots: string[];
  success: boolean | null;
  judgeVerdict: string | null;
  judgeReason: string | null;
  error: string | null;
  totalSteps: number;
  totalTimeMs: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  estimatedCostUsd: number;
  framework: string;
}

// ---------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------
const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator for web browsing agents. Your task is to judge whether the agent successfully completed the given task.

You will be provided with:
1. The task instruction (what the agent was asked to do)
2. The agent's text response (what the agent reported)
3. One or more screenshots of the final browser state

Evaluation criteria:
- The agent must have actually completed the task, not just claimed to.
- Screenshots take precedence over text when there are discrepancies.
- For information retrieval tasks: the answer must be correct or at least reasonable.
- For navigation tasks: the final page state should reflect task completion.
- Partial completion is NOT success. The task must be fully completed.
- If the answer is time-sensitive (stock prices, news, etc.), accept reasonable recent values.

Respond with EXACTLY one of:
- "SUCCESS" if the task was completed successfully
- "NOT_SUCCESS" if the task was not completed

Then provide a brief reason on the next line starting with "Reason: "`;

async function judgeTask(
  question: string,
  answer: string | null,
  screenshots: string[],
  judgeModel: string,
): Promise<{ verdict: string; reason: string }> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey: process.env.JUDGE_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.JUDGE_BASE_URL || 'https://api.openai.com/v1',
  });

  const content: any[] = [
    {
      type: 'text',
      text: `Task instruction: ${question}\n\nAgent's response: ${answer || '(no text response)'}`,
    },
  ];
  for (const s of screenshots.slice(-3)) {
    content.push({
      type: 'image_url',
      image_url: {
        url: s.startsWith('data:') ? s : `data:image/png;base64,${s}`,
        detail: 'high',
      },
    });
  }

  const resp = await client.chat.completions.create({
    model: judgeModel,
    messages: [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    temperature: 0,
    max_tokens: 256,
  });

  const text = resp.choices[0]?.message?.content || '';
  const lines = text.trim().split('\n');
  const first = lines[0]?.trim() || '';
  const verdict = first.includes('NOT_SUCCESS')
    ? 'NOT_SUCCESS'
    : first.includes('SUCCESS')
      ? 'SUCCESS'
      : 'NOT_SUCCESS';
  const reasonLine = lines.find((l) => l.startsWith('Reason:'));
  const reason = reasonLine
    ? reasonLine.replace('Reason:', '').trim()
    : text.trim();
  return { verdict, reason };
}

// ---------------------------------------------------------------------------
// Run a single task
// ---------------------------------------------------------------------------
async function runTask(
  task: (typeof SUBSET_30)[0],
  opts: {
    maxSteps: number;
    timeoutMs: number;
    modelName: string;
    apiKey: string;
    baseUrl: string;
  },
): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = {
    taskId: task.id,
    webName: task.web_name,
    question: task.ques,
    agentAnswer: null,
    screenshots: [],
    success: null,
    judgeVerdict: null,
    judgeReason: null,
    error: null,
    totalSteps: 0,
    totalTimeMs: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    estimatedCostUsd: 0,
    framework: 'stagehand',
  };

  let stagehand: Stagehand | null = null;

  try {
    // Stagehand requires "provider/model" format and uses AI SDK routing
    // Set OpenAI env vars so AI SDK picks them up
    const stagehandModel = opts.modelName.includes('/')
      ? opts.modelName
      : `openai/${opts.modelName}`;

    process.env.OPENAI_API_KEY = opts.apiKey;
    process.env.OPENAI_BASE_URL = opts.baseUrl;

    stagehand = new Stagehand({
      env: 'LOCAL',
      model: stagehandModel as any,
      enableCaching: false,
      verbose: 0,
    });

    await stagehand.init();
    // V3: page is accessed via context, not directly
    const page = stagehand.page || stagehand.context?.pages()?.[0];
    if (!page) throw new Error('Failed to get page from Stagehand');
    await page.goto(task.web, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 3000));

    const agent = stagehand.agent({
      model: stagehandModel as any,
      systemPrompt: `You are a helpful web browsing assistant. Complete the given task by interacting with the web page. When you have the answer, include "Final Answer: <your answer>" in your response.`,
    });

    const agentResult = await Promise.race([
      agent.execute({
        instruction: task.ques,
        maxSteps: opts.maxSteps,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Task timeout')), opts.timeoutMs),
      ),
    ]);

    // Extract answer
    if (agentResult && typeof agentResult === 'object') {
      const resultStr = JSON.stringify(agentResult);
      result.agentAnswer = resultStr;

      // Try to extract final answer
      const match = resultStr.match(/Final Answer:\s*(.+?)(?:"|$)/i);
      if (match) {
        result.agentAnswer = match[1].trim();
      }
    }

    // Get metrics
    try {
      const metrics = await stagehand.metrics;
      if (metrics) {
        result.tokenUsage = {
          inputTokens: metrics.totalPromptTokens || 0,
          outputTokens: metrics.totalCompletionTokens || 0,
          totalTokens:
            (metrics.totalPromptTokens || 0) +
            (metrics.totalCompletionTokens || 0),
        };
      }
    } catch {
      // ignore
    }

    // Get screenshot
    try {
      const screenshot = await page.screenshot({ encoding: 'base64' });
      if (screenshot) {
        result.screenshots.push(screenshot as string);
      }
    } catch {
      // ignore
    }
  } catch (err: any) {
    result.error = err.message || String(err);
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {
        // ignore
      }
    }
  }

  result.totalTimeMs = Date.now() - start;
  result.estimatedCostUsd =
    (result.tokenUsage.inputTokens / 1000) * 0.003 +
    (result.tokenUsage.outputTokens / 1000) * 0.009;

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const hasFlag = (name: string) => args.includes(`--${name}`);

  const apiKey = process.env.QWEN_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL;
  const modelName = process.env.QWEN_MODEL_NAME || 'qwen-vl-max-latest';
  const judgeModel = process.env.JUDGE_MODEL || 'gpt-4o';
  const maxSteps = Number(getArg('max-steps')) || 50;
  const timeoutMs = (Number(getArg('timeout')) || 600) * 1000;
  const skipJudge = hasFlag('skip-judge');
  const onlyTask = getArg('only');
  const trials = Number(getArg('trials')) || 1;

  if (!apiKey || !baseUrl) {
    console.error('QWEN_API_KEY and QWEN_BASE_URL are required');
    process.exit(1);
  }

  let dataset = SUBSET_30;
  if (onlyTask) dataset = dataset.filter((t) => t.id === onlyTask);

  console.log('Stagehand + Qwen WebVoyager Eval');
  console.log(`Model: ${modelName}`);
  console.log(`Tasks: ${dataset.length}`);
  console.log(`Max steps: ${maxSteps}, Timeout: ${timeoutMs / 1000}s`);
  console.log(`Judge: ${skipJudge ? 'SKIPPED' : judgeModel}`);

  const outputDir = getArg('output') || path.join(__dirname, 'results');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Helper: check real success
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

  const results: TaskResult[] = [];

  for (let i = 0; i < dataset.length; i++) {
    const task = dataset[i];
    console.log(`\n[${i + 1}/${dataset.length}] ${task.id} - ${task.web_name}`);
    console.log(`  Q: ${task.ques.slice(0, 80)}...`);

    let bestResult: TaskResult | null = null;

    for (let trial = 1; trial <= trials; trial++) {
      if (trials > 1) console.log(`  Trial ${trial}/${trials}`);

      const r = await runTask(task, {
        maxSteps,
        timeoutMs,
        modelName,
        apiKey,
        baseUrl,
      });

      console.log(
        `  Done in ${(r.totalTimeMs / 1000).toFixed(1)}s | Steps: ${r.totalSteps} | Tokens: ${r.tokenUsage.totalTokens} | Answer: ${(r.agentAnswer || '(none)').slice(0, 60)}`,
      );

      if (!bestResult || (!isRealSuccess(bestResult) && isRealSuccess(r))) {
        bestResult = r;
      } else if (isRealSuccess(bestResult) && isRealSuccess(r)) {
        if (r.tokenUsage.totalTokens < bestResult.tokenUsage.totalTokens) {
          bestResult = r;
        }
      }

      if (isRealSuccess(r)) {
        if (trials > 1) console.log(`  ✅ Succeeded on trial ${trial}`);
        break;
      }
    }

    results.push(bestResult!);

    // Save intermediate
    writeFileSync(
      path.join(outputDir, 'results-intermediate.json'),
      JSON.stringify(
        results.map((r) => ({ ...r, screenshots: [] })),
        null,
        2,
      ),
    );
  }

  // Judge
  if (!skipJudge) {
    console.log(`\nJudging ${results.length} results with ${judgeModel}...`);
    for (const r of results) {
      if (r.error) {
        r.judgeVerdict = 'NOT_SUCCESS';
        r.judgeReason = `Agent error: ${r.error}`;
        r.success = false;
        continue;
      }
      try {
        const j = await judgeTask(
          r.question,
          r.agentAnswer,
          r.screenshots,
          judgeModel,
        );
        r.judgeVerdict = j.verdict;
        r.judgeReason = j.reason;
        r.success = j.verdict === 'SUCCESS';
        console.log(`  ${r.taskId}: ${j.verdict}`);
      } catch (err: any) {
        r.judgeReason = `Judge error: ${err.message}`;
      }
    }
  }

  // Summary
  const judged = results.filter((r) => r.success !== null);
  const successCount = judged.filter((r) => r.success).length;
  const totalInput = results.reduce((s, r) => s + r.tokenUsage.inputTokens, 0);
  const totalOutput = results.reduce(
    (s, r) => s + r.tokenUsage.outputTokens,
    0,
  );

  const summary = {
    framework: 'stagehand',
    modelName,
    timestamp: new Date().toISOString(),
    totalTasks: results.length,
    successCount,
    successRate: judged.length > 0 ? successCount / judged.length : 0,
    avgSteps:
      results.length > 0
        ? results.reduce((s, r) => s + r.totalSteps, 0) / results.length
        : 0,
    avgTimeMs:
      results.length > 0
        ? results.reduce((s, r) => s + r.totalTimeMs, 0) / results.length
        : 0,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCostUsd: results.reduce((s, r) => s + r.estimatedCostUsd, 0),
    results: results.map((r) => ({ ...r, screenshots: [] })),
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log('STAGEHAND + QWEN WEBVOYAGER RESULTS');
  console.log('='.repeat(60));
  console.log(`Model: ${modelName}`);
  console.log(
    `Success Rate: ${(summary.successRate * 100).toFixed(1)}% (${successCount}/${judged.length})`,
  );
  console.log(`Avg Steps: ${summary.avgSteps.toFixed(1)}`);
  console.log(`Avg Time: ${(summary.avgTimeMs / 1000).toFixed(1)}s`);
  console.log(`Total Tokens: ${totalInput} in / ${totalOutput} out`);
  console.log(`Total Cost: $${summary.totalCostUsd.toFixed(2)}`);

  const outPath = path.join(
    outputDir,
    `eval-stagehand-${modelName}-${Date.now()}.json`,
  );
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nResults saved to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
