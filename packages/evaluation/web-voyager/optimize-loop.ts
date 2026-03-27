/**
 * Prompt Optimization Loop for Midscene
 *
 * Automated cycle: run benchmark → judge → analyze → modify prompt → repeat
 *
 * Usage:
 *   npx tsx web-voyager/optimize-loop.ts [--iterations 5] [--tasks "GitHub--5,Coursera--5,Amazon--10"]
 *
 * Architecture:
 *   1. FAST SUBSET: 8 diverse tasks that cover different patterns (~15min per iteration)
 *   2. Each iteration: run Midscene → judge answers → analyze failures → propose prompt changes
 *   3. All iterations tracked in web-voyager/optimization-runs/ with full audit trail
 *   4. Human reviews proposed changes before next iteration (or --auto for autonomous)
 */

import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';

const WV = __dirname;
const RUNS_DIR = path.join(WV, 'optimization-runs');
const PROMPT_FILE = path.join(
  WV,
  '../../core/src/ai-model/prompt/llm-planning.ts',
);

// ── Config ──────────────────────────────────────────────────────────────────

// Fast subset: 8 tasks covering diverse patterns
const DEFAULT_FAST_TASKS = [
  'GitHub--5', // simple info extraction
  'Coursera--5', // search + extract structured info
  'Amazon--10', // multi-step product search
  'ArXiv--5', // cross-site navigation
  'BBC News--5', // open-ended content extraction
  'Google Map--20', // location search + filter
  'Wolfram Alpha--5', // computation tool usage
  'ESPN--10', // stats lookup
];

// Analyzer model (GPT-5.4)
const ANALYZER_API_KEY = 'lciEIVKhFtxK53A4mKtJ4AXRGC74NFrY_GPT_AK';
const ANALYZER_BASE_URL =
  'https://search.bytedance.net/gpt/openapi/online/v2/crawl/openai/deployments';
const ANALYZER_MODEL = 'gpt-5.4-2026-03-05';

const analyzerClient = new OpenAI({
  apiKey: ANALYZER_API_KEY,
  baseURL: ANALYZER_BASE_URL,
  defaultHeaders: {
    'api-key': ANALYZER_API_KEY,
    'x-tt-logid': 'midscene-trail',
  },
});

// ── Parse args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let maxIterations = 5;
  let tasks = DEFAULT_FAST_TASKS;
  let autoMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && args[i + 1]) {
      maxIterations = Number.parseInt(args[i + 1]);
      i++;
    }
    if (args[i] === '--tasks' && args[i + 1]) {
      tasks = args[i + 1].split(',');
      i++;
    }
    if (args[i] === '--auto') {
      autoMode = true;
    }
  }
  return { maxIterations, tasks, autoMode };
}

// ── Step 1: Run benchmark ───────────────────────────────────────────────────

function runBenchmark(tasks: string[], iterDir: string): any[] {
  console.log(`\n📊 Running benchmark on ${tasks.length} tasks...`);
  const tasksArg = tasks.map((t) => `"${t}"`).join(',');
  const outDir = path.join(iterDir, 'results');
  mkdirSync(outDir, { recursive: true });

  // Clean old intermediate data in output dir
  const oldInt = path.join(outDir, 'results-intermediate.json');
  if (existsSync(oldInt)) {
    const fs = require('node:fs');
    fs.unlinkSync(oldInt);
  }

  // Run each task individually to capture per-task results
  const results: any[] = [];
  const evalDir = path.join(WV, '..');
  for (const task of tasks) {
    console.log(`  Running: ${task}`);
    try {
      const output = execSync(
        `npx tsx web-voyager/runner-midscene.ts --only "${task}" --skip-judge --output "${outDir}"`,
        {
          cwd: evalDir,
          timeout: 600_000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      // Parse Done line for quick summary
      const doneLine = output
        .split('\n')
        .find((l: string) => l.includes('Done in'));
      if (doneLine) console.log(`  ${doneLine.trim()}`);
    } catch (err: any) {
      // execSync throws on timeout but the runner may have written results
      const stderr =
        err.stderr?.slice(0, 100) || err.message?.slice(0, 100) || '';
      console.log(`  ⚠️  ${task}: ${stderr}`);
    }

    // Read intermediate result — runner writes one entry per --only run
    const intPath = path.join(outDir, 'results-intermediate.json');
    if (existsSync(intPath)) {
      const data = JSON.parse(readFileSync(intPath, 'utf-8'));
      // May contain results from previous tasks in this iteration too
      const taskResult = data.find((r: any) => r.taskId === task);
      if (taskResult) {
        // Avoid duplicates
        if (!results.find((r) => r.taskId === task)) {
          results.push(taskResult);
        }
      } else {
        console.log(`  ⚠️  ${task}: no result in intermediate json`);
      }
    } else {
      console.log(`  ⚠️  ${task}: no intermediate json written`);
    }
  }

  // Save combined results (strip screenshots to keep file small, but preserve for judge)
  writeFileSync(
    path.join(iterDir, 'benchmark-results.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(`  ✅ ${results.length}/${tasks.length} tasks completed`);
  return results;
}

// ── Step 2: Judge answers ───────────────────────────────────────────────────

async function judgeResults(results: any[], iterDir: string): Promise<any[]> {
  console.log(`\n⚖️  Judging ${results.length} results...`);

  // Load reference answers
  const refPath = path.join(WV, '_workspace/eval/data/reference_answer.json');
  const refData = existsSync(refPath)
    ? JSON.parse(readFileSync(refPath, 'utf-8'))
    : {};
  const refMap = new Map<string, string>();
  for (const [webName, data] of Object.entries(refData) as any) {
    for (const a of data.answers || []) {
      refMap.set(`${webName}--${a.id}`, a.ans);
    }
  }

  const judged: any[] = [];

  for (const r of results) {
    const answer = r.agentAnswer || '';
    const question = r.question || r.taskId;
    // Reference answers use original WebVoyager IDs which may not match our task IDs.
    // Only include if the reference actually relates to the task (basic sanity check).
    let refAnswer = refMap.get(r.taskId) || null;
    if (refAnswer && question && refAnswer.length > 5) {
      // Check if any keyword from the question appears in reference
      const qWords = question
        .toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 4);
      const refLower = refAnswer.toLowerCase();
      const overlap = qWords.filter((w: string) => refLower.includes(w)).length;
      if (overlap < 1) {
        refAnswer = null; // reference doesn't match task
      }
    }

    if (r.error || !answer) {
      judged.push({
        ...r,
        judgeVerdict: 'ERROR',
        judgeReason: r.error || 'no answer',
      });
      console.log(`  ${r.taskId}: ERROR`);
      continue;
    }

    // Pre-filter
    if (
      answer.toLowerCase().includes('unable to') ||
      answer.includes('"success":false')
    ) {
      judged.push({
        ...r,
        judgeVerdict: 'NOT_SUCCESS',
        judgeReason: 'answer indicates failure',
      });
      console.log(`  ${r.taskId}: NOT_SUCCESS (pre-filter)`);
      continue;
    }

    // Call judge
    try {
      const resp = await analyzerClient.chat.completions.create({
        model: ANALYZER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a judge evaluating web agent task completion. Respond with exactly "SUCCESS" or "NOT_SUCCESS" on the first line, then "Reason: ..." on the second line.

CRITICAL RULES:
- For REAL-TIME data (GitHub stars, download counts, prices, rankings, exchange rates, sports stats, news headlines): the agent visited the LIVE website and reported what it saw. You MUST accept ANY specific numeric value as correct. Do NOT compare against your training data. A value like "244k stars" is valid if the task asked for star count — you cannot know the exact current number.
- For FACTUAL data (paper titles, authors, dates, definitions, version numbers): verify against your knowledge.
- If the answer addresses the task question with a specific, plausible value in the correct format, judge it as SUCCESS.
- Only judge NOT_SUCCESS if: the answer is clearly fabricated, addresses the wrong question, or the agent failed to complete the task.
- IGNORE the reference answer if it seems unrelated to the task (reference answers may be mismatched).`,
          },
          {
            role: 'user',
            content: `Task: ${question}\nAgent answer: ${answer}${refAnswer ? `\nReference (hint): ${refAnswer}` : ''}`,
          },
        ],
        temperature: 0,
        max_tokens: 200,
      });
      const text = resp.choices[0]?.message?.content || '';
      const firstLine = text.split('\n')[0]?.trim() || '';
      const verdict = firstLine.includes('NOT_SUCCESS')
        ? 'NOT_SUCCESS'
        : firstLine.includes('SUCCESS')
          ? 'SUCCESS'
          : 'NOT_SUCCESS';
      const reason =
        text
          .split('\n')
          .find((l) => l.startsWith('Reason:'))
          ?.replace('Reason:', '')
          .trim() || text.slice(0, 100);

      judged.push({ ...r, judgeVerdict: verdict, judgeReason: reason });
      console.log(`  ${r.taskId}: ${verdict}`);
    } catch (err: any) {
      judged.push({
        ...r,
        judgeVerdict: 'JUDGE_ERROR',
        judgeReason: err.message?.slice(0, 60),
      });
      console.log(`  ${r.taskId}: JUDGE_ERROR`);
    }
  }

  writeFileSync(
    path.join(iterDir, 'judge-results.json'),
    JSON.stringify(judged, null, 2),
  );
  return judged;
}

// ── Step 3: Analyze failures ────────────────────────────────────────────────

async function analyzeAndPropose(
  judged: any[],
  currentRules: string,
  history: string,
  iterDir: string,
): Promise<{
  analysis: string;
  proposedRules: string;
  shouldContinue: boolean;
}> {
  console.log('\n🔍 Analyzing results and proposing changes...');

  const succeeded = judged.filter((r) => r.judgeVerdict === 'SUCCESS');
  const failed = judged.filter((r) => r.judgeVerdict !== 'SUCCESS');

  const successRate = `${succeeded.length}/${judged.length}`;
  const avgToken =
    judged.length > 0
      ? Math.round(
          judged.reduce((s, r) => s + (r.tokenUsage?.totalTokens || 0), 0) /
            judged.length,
        )
      : 0;

  // Build failure details
  const failureDetails = failed
    .map((r) => {
      const steps = r.totalSteps || 0;
      const tokens = r.tokenUsage?.totalTokens || 0;
      return `- ${r.taskId}: verdict=${r.judgeVerdict}, reason="${r.judgeReason}", steps=${steps}, tokens=${tokens}, answer="${(r.agentAnswer || '').slice(0, 200)}"`;
    })
    .join('\n');

  const successDetails = succeeded
    .map((r) => {
      const steps = r.totalSteps || 0;
      const tokens = r.tokenUsage?.totalTokens || 0;
      return `- ${r.taskId}: steps=${steps}, tokens=${tokens}`;
    })
    .join('\n');

  const prompt = `You are an expert at optimizing web agent system prompts. Analyze the benchmark results and propose specific improvements to the efficiency rules.

## Current Efficiency Rules in the Prompt
\`\`\`
${currentRules}
\`\`\`

## This Iteration Results
- Success rate: ${successRate}
- Average tokens: ${avgToken}

### Failed tasks:
${failureDetails || '(none)'}

### Succeeded tasks:
${successDetails || '(none)'}

## Previous Optimization History
${history || '(first iteration)'}

## Your Task

1. **Root cause analysis**: For each failed task, identify WHY the agent failed. Common causes:
   - CAPTCHA/security block (not fixable via prompt)
   - Infinite loop / too many retries
   - Wrong navigation strategy
   - Failed to find element
   - Gave up too early
   - Fabricated answer

2. **Token analysis**: For succeeded tasks with high token count, identify what caused inefficiency.

3. **Propose rule changes**: Output EXACTLY the new efficiency rules section (markdown list format, same as current). Rules should be:
   - Specific and actionable (not vague)
   - Addressing observed failure patterns
   - Not adding rules for problems that didn't occur
   - Removing or weakening rules that cause problems

4. **Decision**: Should we continue optimizing? Set shouldContinue=false if:
   - All fixable tasks pass (only CAPTCHA/infra failures remain)
   - Token efficiency is reasonable (avg < 60K for fast subset)
   - No clear improvement opportunity in prompt

## Output Format (STRICT JSON)
\`\`\`json
{
  "analysis": "2-3 paragraph analysis of what happened and why",
  "proposedRules": "### Efficiency rules\\n\\n- **Rule name**: Rule description.\\n- ...",
  "shouldContinue": true/false,
  "changesExplained": "List of what changed and why, one per line"
}
\`\`\``;

  const resp = await analyzerClient.chat.completions.create({
    model: ANALYZER_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a prompt optimization expert. Always respond with valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const text = resp.choices[0]?.message?.content || '';

  // Parse JSON from response (may be wrapped in ```json ... ```)
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  let result: any;
  try {
    result = JSON.parse(jsonMatch ? jsonMatch[1] || jsonMatch[0] : text);
  } catch {
    result = {
      analysis: text,
      proposedRules: currentRules,
      shouldContinue: false,
      changesExplained: 'Failed to parse analyzer response',
    };
  }

  // Save analysis
  writeFileSync(
    path.join(iterDir, 'analysis.json'),
    JSON.stringify(result, null, 2),
  );
  writeFileSync(path.join(iterDir, 'analysis-raw.txt'), text);

  console.log('\n📋 Analysis:');
  console.log(result.analysis);
  console.log('\n🔧 Changes:');
  console.log(result.changesExplained);
  console.log(`\n🔄 Continue: ${result.shouldContinue}`);

  return result;
}

// ── Step 4: Apply prompt changes ────────────────────────────────────────────

function extractCurrentRules(): string {
  const content = readFileSync(PROMPT_FILE, 'utf-8');
  const match = content.match(
    /### Efficiency rules\n\n([\s\S]*?)(?=\n### Supporting actions list)/,
  );
  return match ? match[1].trim() : '';
}

function applyRules(newRules: string): void {
  let content = readFileSync(PROMPT_FILE, 'utf-8');
  const oldRules = extractCurrentRules();
  if (oldRules) {
    content = content.replace(
      oldRules,
      newRules.replace('### Efficiency rules\n\n', '').trim(),
    );
  }
  writeFileSync(PROMPT_FILE, content);

  // Rebuild
  console.log('\n🔨 Rebuilding...');
  execSync('pnpm run build 2>&1 | tail -2', {
    cwd: path.join(WV, '../../web-integration'),
    encoding: 'utf-8',
  });
  console.log('  ✅ Build complete');
}

// ── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  const { maxIterations, tasks, autoMode } = parseArgs();

  mkdirSync(RUNS_DIR, { recursive: true });

  // Save initial state
  const runId = Date.now();
  const runDir = path.join(RUNS_DIR, `run-${runId}`);
  mkdirSync(runDir, { recursive: true });

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Midscene Prompt Optimization Loop           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Tasks: ${tasks.join(', ')}`);
  console.log(`Max iterations: ${maxIterations}`);
  console.log(`Mode: ${autoMode ? 'autonomous' : 'interactive'}`);
  console.log(`Run dir: ${runDir}`);

  let history = '';

  for (let iter = 1; iter <= maxIterations; iter++) {
    const iterDir = path.join(runDir, `iter-${iter}`);
    mkdirSync(iterDir, { recursive: true });

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ITERATION ${iter}/${maxIterations}`);
    console.log(`${'═'.repeat(60)}`);

    // Save current prompt
    const currentRules = extractCurrentRules();
    writeFileSync(path.join(iterDir, 'prompt-before.txt'), currentRules);

    // Step 1: Run benchmark
    const results = runBenchmark(tasks, iterDir);

    // Step 2: Judge
    const judged = await judgeResults(results, iterDir);

    // Step 3: Analyze & propose
    const { analysis, proposedRules, shouldContinue, changesExplained } =
      await analyzeAndPropose(judged, currentRules, history, iterDir);

    // Update history
    const succeeded = judged.filter((r) => r.judgeVerdict === 'SUCCESS').length;
    const avgTok = Math.round(
      judged.reduce((s, r) => s + (r.tokenUsage?.totalTokens || 0), 0) /
        Math.max(judged.length, 1),
    );
    history += `\nIteration ${iter}: ${succeeded}/${judged.length} success, avg ${avgTok} tokens. Changes: ${changesExplained}`;

    // Summary table
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`ITERATION ${iter} SUMMARY`);
    console.log(`${'─'.repeat(60)}`);
    console.log(
      `${'Task'.padEnd(25)} ${'Verdict'.padEnd(14)} ${'Steps'.padEnd(8)} ${'Tokens'.padEnd(10)}`,
    );
    for (const r of judged) {
      const v = r.judgeVerdict === 'SUCCESS' ? '✅' : '❌';
      console.log(
        `${r.taskId.padEnd(25)} ${v.padEnd(14)} ${String(r.totalSteps || 0).padEnd(8)} ${String(r.tokenUsage?.totalTokens || 0).padEnd(10)}`,
      );
    }
    console.log(`${'─'.repeat(60)}`);
    console.log(
      `Success: ${succeeded}/${judged.length} | Avg tokens: ${avgTok}`,
    );

    if (!shouldContinue) {
      console.log('\n🎯 Optimizer says: stop (no more improvements possible)');
      break;
    }

    if (!autoMode) {
      console.log(`\n⏸️  Proposed changes saved to: ${iterDir}/analysis.json`);
      console.log(
        '   Review and run again with --auto to apply automatically.',
      );
      console.log(
        '   Or apply manually and rerun: npx tsx web-voyager/optimize-loop.ts',
      );

      // Save proposed rules for manual review
      writeFileSync(path.join(iterDir, 'prompt-proposed.txt'), proposedRules);
      break;
    }

    // Auto mode: apply changes
    console.log('\n🔄 Applying proposed changes...');
    writeFileSync(path.join(iterDir, 'prompt-proposed.txt'), proposedRules);
    applyRules(proposedRules);
    writeFileSync(
      path.join(iterDir, 'prompt-after.txt'),
      extractCurrentRules(),
    );
  }

  // Save run summary
  writeFileSync(
    path.join(runDir, 'summary.json'),
    JSON.stringify(
      {
        runId,
        tasks,
        maxIterations,
        autoMode,
        history,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  // Generate HTML report
  try {
    console.log('\n📄 Generating report...');
    execSync(`npx tsx web-voyager/generate-report.ts "${runDir}"`, {
      cwd: path.join(WV, '..'),
      encoding: 'utf-8',
      timeout: 30_000,
    });
  } catch (err: any) {
    console.log(`  ⚠️ Report generation failed: ${err.message?.slice(0, 60)}`);
  }

  console.log(`\n✅ Optimization run complete. Results in: ${runDir}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
