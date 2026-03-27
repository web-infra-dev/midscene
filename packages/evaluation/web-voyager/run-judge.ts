/**
 * Standalone judge script: evaluate all three frameworks' answers using GPT-5.4
 *
 * Improvements over naive judging:
 * A. Screenshots included when available (visual evidence)
 * B. Prompt distinguishes real-time vs factual data
 * C. WebVoyager reference answers used as hints
 * D. Two-round judging: workflow completion + answer correctness
 *
 * Usage:
 *   npx tsx web-voyager/run-judge.ts
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({
  path: path.join(__dirname, '../../../.env'),
  override: true,
});

const WV = __dirname;

// Judge model config (GPT-5.4 via ByteDance proxy)
const JUDGE_API_KEY = 'lciEIVKhFtxK53A4mKtJ4AXRGC74NFrY_GPT_AK';
const JUDGE_BASE_URL =
  'https://search.bytedance.net/gpt/openapi/online/v2/crawl/openai/deployments';
const JUDGE_MODEL = 'gpt-5.4-2026-03-05';

const judgeClient = new OpenAI({
  apiKey: JUDGE_API_KEY,
  baseURL: JUDGE_BASE_URL,
  defaultHeaders: {
    'api-key': JUDGE_API_KEY,
    'x-tt-logid': 'midscene-trail',
  },
});

const EXCLUDE = new Set(['Allrecipes--3', 'Allrecipes--10', 'Apple--5']);

// ---------------------------------------------------------------------------
// Load reference answers
// ---------------------------------------------------------------------------
function loadReferenceAnswers(): Map<string, { type: string; ans: string }> {
  const refPath = path.join(WV, '_workspace/eval/data/reference_answer.json');
  if (!existsSync(refPath)) {
    console.warn('Reference answers not found, proceeding without them');
    return new Map();
  }
  const raw = JSON.parse(readFileSync(refPath, 'utf-8'));
  const map = new Map<string, { type: string; ans: string }>();

  for (const [webName, data] of Object.entries(raw) as any) {
    const answers = data.answers || [];
    for (const a of answers) {
      // Match ID format: "WebName--N"
      const taskId = `${webName}--${a.id}`;
      map.set(taskId, { type: a.type, ans: a.ans });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Two-round judge prompt
// ---------------------------------------------------------------------------
const ROUND1_PROMPT = `You are an expert evaluator for web browsing agents.

## Round 1: Workflow Completion Check

Judge whether the agent successfully completed the required WORKFLOW (navigation, search, interaction steps), regardless of the exact answer values.

You will be provided with:
1. The task instruction
2. The agent's text response
3. A screenshot of the final browser state (if available)
4. A reference answer (if available) — use as a HINT, not absolute truth

## Evaluation criteria:
- Did the agent navigate to the correct website/page?
- Did the agent perform the required actions (search, filter, click, etc.)?
- Did the agent find and report information of the expected TYPE (even if specific values differ)?
- For real-time data (prices, rankings, exchange rates, news headlines, download counts, star counts): accept ANY reasonable current value. These change frequently and the agent's answer reflects what was on the page at the time.
- For factual data (paper titles, submission dates, definitions, license types): the answer should be verifiable and correct.
- If the agent says it was "unable to" or "could not" complete the task, that is NOT success.
- If the agent clearly fabricated data without visiting the actual page, that is NOT success.

## IMPORTANT: Do NOT judge real-time values against your training data. The agent visited the actual website and reported what it saw. If the format and type of information is correct, trust the agent's reported values for real-time data.

Respond with EXACTLY one of:
- "WORKFLOW_COMPLETE" if the agent performed the correct workflow and found relevant information
- "WORKFLOW_INCOMPLETE" if the agent failed to complete the required steps

Then provide a brief reason on the next line starting with "Reason: "`;

const ROUND2_PROMPT = `You are an expert evaluator for web browsing agents.

## Round 2: Answer Quality Check

The agent has been confirmed to complete the correct workflow. Now judge whether the ANSWER CONTENT is acceptable.

You will be provided with:
1. The task instruction
2. The agent's text response
3. A reference answer (if available) — use as a HINT for expected answer format/type
4. A screenshot of the final browser state (if available)

## Evaluation criteria:
- Does the answer address what the task asked for?
- Is the answer format reasonable (e.g., lists items when asked to list, gives a number when asked for a count)?
- For REAL-TIME data (prices, rankings, exchange rates, star counts, download counts, news headlines, population, distances): ANY reasonable current value is acceptable. Do NOT compare against your training data. If the answer provides a specific number/value in the correct format, accept it.
- For FACTUAL data (paper titles, authors, submission dates, word definitions, license types, version numbers): verify against your knowledge. These should be correct.
- Partial answers that address the core question are acceptable (e.g., finding one restaurant when asked to "find one with 4+ stars").

Respond with EXACTLY one of:
- "SUCCESS" if the answer is acceptable
- "NOT_SUCCESS" if the answer is clearly wrong, fabricated, or does not address the task

Then provide a brief reason on the next line starting with "Reason: "`;

// ---------------------------------------------------------------------------
// Judge call
// ---------------------------------------------------------------------------
async function callJudge(
  systemPrompt: string,
  question: string,
  answer: string,
  referenceAnswer: string | null,
  screenshot: string | null,
): Promise<{ verdict: string; reason: string }> {
  const userParts: OpenAI.ChatCompletionContentPart[] = [];

  let text = `Task instruction: ${question}\n\nAgent's response: ${answer}`;
  if (referenceAnswer) {
    text += `\n\nReference answer (hint, may be outdated): ${referenceAnswer}`;
  }
  userParts.push({ type: 'text', text });

  // Attach screenshot if available
  if (screenshot) {
    userParts.push({
      type: 'image_url',
      image_url: {
        url: screenshot.startsWith('data:')
          ? screenshot
          : `data:image/png;base64,${screenshot}`,
        detail: 'low', // low detail to save tokens
      },
    });
  }

  const response = await judgeClient.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userParts },
    ],
    temperature: 0,
    max_tokens: 300,
  });

  const responseText = response.choices[0]?.message?.content || '';
  const lines = responseText.trim().split('\n');
  const firstLine = lines[0]?.trim() || '';

  // Parse verdict
  let verdict = 'UNKNOWN';
  if (
    firstLine.includes('WORKFLOW_COMPLETE') &&
    !firstLine.includes('INCOMPLETE')
  ) {
    verdict = 'WORKFLOW_COMPLETE';
  } else if (firstLine.includes('WORKFLOW_INCOMPLETE')) {
    verdict = 'WORKFLOW_INCOMPLETE';
  } else if (firstLine.includes('NOT_SUCCESS')) {
    verdict = 'NOT_SUCCESS';
  } else if (firstLine.includes('SUCCESS')) {
    verdict = 'SUCCESS';
  }

  const reasonLine = lines.find((l) => l.startsWith('Reason:'));
  const reason = reasonLine
    ? reasonLine.replace('Reason:', '').trim()
    : responseText.trim().slice(0, 150);

  return { verdict, reason };
}

// ---------------------------------------------------------------------------
// Types & loading
// ---------------------------------------------------------------------------
interface TaskResult {
  taskId: string;
  question?: string;
  agentAnswer: string | null;
  error: string | null;
  finalScreenshot?: string | null;
  tokenUsage: { totalTokens: number };
}

function loadResults(filePath: string, key?: string): TaskResult[] {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  return key ? raw[key] : raw;
}

function findLatestFile(dir: string, prefix: string): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .reverse();
  return files[0] ? path.join(dir, files[0]) : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('WebVoyager Two-Round Judge (GPT-5.4)');
  console.log(`Model: ${JUDGE_MODEL}`);
  console.log(
    'Features: A.Screenshots B.Real-time aware C.Reference answers D.Two-round',
  );
  console.log('');

  // Load reference answers
  const refAnswers = loadReferenceAnswers();
  console.log(`Loaded ${refAnswers.size} reference answers`);

  // Load results - use most complete files
  // Use the latest complete run (2026-03-26, 7MB with screenshots)
  const msPath = path.join(
    WV,
    'results/eval-openai_qwen3.5-plus-30-1774538677176.json',
  );
  const buPath = path.join(
    WV,
    '_workspace/eval/results/results-intermediate.json',
  );
  const shPath = findLatestFile(
    path.join(WV, '_workspace/stagehand/results'),
    'eval-stagehand',
  );

  if (!existsSync(msPath)) throw new Error('Midscene results not found');
  if (!existsSync(buPath)) throw new Error('Browser Use results not found');
  if (!shPath) throw new Error('Stagehand results not found');

  const msResults = loadResults(msPath, 'results');
  const buResults = loadResults(buPath);
  const shResults = loadResults(shPath, 'results');

  const msMap = new Map(msResults.map((r) => [r.taskId, r]));
  const buMap = new Map(buResults.map((r) => [r.taskId, r]));
  const shMap = new Map(shResults.map((r) => [r.taskId, r]));

  const allTasks = [
    ...new Set([...msMap.keys(), ...buMap.keys(), ...shMap.keys()]),
  ].sort();

  type JudgeResult = {
    answer: string;
    round1: string;
    round1Reason: string;
    round2: string;
    round2Reason: string;
    finalVerdict: string;
    tokens: number;
    hasScreenshot: boolean;
  };

  type TaskVerdict = {
    taskId: string;
    question: string;
    refAnswer: string | null;
    refType: string | null;
    ms: JudgeResult;
    bu: JudgeResult;
    sh: JudgeResult;
  };

  const verdicts: TaskVerdict[] = [];

  for (const taskId of allTasks) {
    if (EXCLUDE.has(taskId)) continue;

    const ms = msMap.get(taskId);
    const bu = buMap.get(taskId);
    const sh = shMap.get(taskId);

    const question =
      (ms as any)?.question ||
      (bu as any)?.question ||
      (sh as any)?.question ||
      taskId;

    const ref = refAnswers.get(taskId);
    const refAnswer = ref?.ans || null;
    const refType = ref?.type || null;

    console.log(`\n=== ${taskId} ===`);
    console.log(`  Q: ${question.slice(0, 80)}`);
    if (refAnswer) console.log(`  Ref (${refType}): ${refAnswer.slice(0, 60)}`);

    const verdict: TaskVerdict = {
      taskId,
      question,
      refAnswer,
      refType,
      ms: {
        answer: '',
        round1: 'SKIP',
        round1Reason: '',
        round2: 'SKIP',
        round2Reason: '',
        finalVerdict: 'SKIP',
        tokens: 0,
        hasScreenshot: false,
      },
      bu: {
        answer: '',
        round1: 'SKIP',
        round1Reason: '',
        round2: 'SKIP',
        round2Reason: '',
        finalVerdict: 'SKIP',
        tokens: 0,
        hasScreenshot: false,
      },
      sh: {
        answer: '',
        round1: 'SKIP',
        round1Reason: '',
        round2: 'SKIP',
        round2Reason: '',
        finalVerdict: 'SKIP',
        tokens: 0,
        hasScreenshot: false,
      },
    };

    for (const [name, result, target] of [
      ['Midscene', ms, verdict.ms],
      ['BrowserUse', bu, verdict.bu],
      ['Stagehand', sh, verdict.sh],
    ] as const) {
      const r = result as TaskResult | undefined;
      const t = target as JudgeResult;

      if (!r || r.error) {
        t.finalVerdict = 'ERROR';
        t.round1Reason = r?.error?.slice(0, 60) || 'no result';
        t.tokens = r?.tokenUsage?.totalTokens || 0;
        console.log(`  ${name}: ERROR - ${t.round1Reason}`);
        continue;
      }

      const answer = r.agentAnswer || '';
      t.answer = answer;
      t.tokens = r.tokenUsage?.totalTokens || 0;
      t.hasScreenshot = !!r.finalScreenshot;

      // Pre-filter obvious failures
      const ansLower = answer.toLowerCase();
      if (
        ansLower.includes('unable to') ||
        ansLower.includes('was unable') ||
        answer.includes('"success":false') ||
        answer.includes('"success": false') ||
        t.tokens === 0
      ) {
        t.finalVerdict = 'NOT_SUCCESS';
        t.round1 = 'WORKFLOW_INCOMPLETE';
        t.round1Reason = 'Pre-filter: answer indicates failure';
        console.log(`  ${name}: NOT_SUCCESS (pre-filter)`);
        continue;
      }

      // Only use screenshot if it's valid base64 (not placeholder text)
      let screenshot = r.finalScreenshot || null;
      if (
        screenshot &&
        (screenshot.includes('omitted') || screenshot.length < 100)
      ) {
        screenshot = null;
      }

      // Round 1: Workflow completion
      try {
        const r1 = await callJudge(
          ROUND1_PROMPT,
          question,
          answer,
          refAnswer,
          screenshot,
        );
        t.round1 = r1.verdict;
        t.round1Reason = r1.reason;

        if (r1.verdict !== 'WORKFLOW_COMPLETE') {
          t.finalVerdict = 'NOT_SUCCESS';
          console.log(
            `  ${name}: R1=${r1.verdict} - ${r1.reason.slice(0, 50)}`,
          );
          continue;
        }
      } catch (err: any) {
        t.round1 = 'JUDGE_ERROR';
        t.round1Reason = err.message?.slice(0, 60) || 'judge error';
        t.finalVerdict = 'JUDGE_ERROR';
        console.log(`  ${name}: R1=JUDGE_ERROR - ${t.round1Reason}`);
        continue;
      }

      // Round 2: Answer quality
      try {
        const r2 = await callJudge(
          ROUND2_PROMPT,
          question,
          answer,
          refAnswer,
          screenshot,
        );
        t.round2 = r2.verdict;
        t.round2Reason = r2.reason;
        t.finalVerdict = r2.verdict === 'SUCCESS' ? 'SUCCESS' : 'NOT_SUCCESS';
        console.log(
          `  ${name}: R1=✅ R2=${r2.verdict} - ${r2.reason.slice(0, 50)}`,
        );
      } catch (err: any) {
        t.round2 = 'JUDGE_ERROR';
        t.round2Reason = err.message?.slice(0, 60) || 'judge error';
        t.finalVerdict = 'JUDGE_ERROR';
        console.log(`  ${name}: R2=JUDGE_ERROR - ${t.round2Reason}`);
      }
    }

    verdicts.push(verdict);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n${'='.repeat(80)}`);
  console.log('TWO-ROUND JUDGE RESULTS');
  console.log('='.repeat(80));

  console.log(
    `\n${'Task'.padEnd(28)} ${'Midscene'.padEnd(14)} ${'BrowserUse'.padEnd(14)} ${'Stagehand'.padEnd(14)}`,
  );
  console.log('-'.repeat(70));

  let msOk = 0;
  let buOk = 0;
  let shOk = 0;
  const commonOk: string[] = [];

  for (const v of verdicts) {
    const ms = v.ms.finalVerdict === 'SUCCESS' ? '✅' : '❌';
    const bu = v.bu.finalVerdict === 'SUCCESS' ? '✅' : '❌';
    const sh = v.sh.finalVerdict === 'SUCCESS' ? '✅' : '❌';

    if (v.ms.finalVerdict === 'SUCCESS') msOk++;
    if (v.bu.finalVerdict === 'SUCCESS') buOk++;
    if (v.sh.finalVerdict === 'SUCCESS') shOk++;

    if (
      v.ms.finalVerdict === 'SUCCESS' &&
      v.bu.finalVerdict === 'SUCCESS' &&
      v.sh.finalVerdict === 'SUCCESS'
    ) {
      commonOk.push(v.taskId);
    }

    console.log(
      `${v.taskId.padEnd(28)} ${ms.padEnd(14)} ${bu.padEnd(14)} ${sh.padEnd(14)}`,
    );
  }

  const n = verdicts.length;
  console.log('-'.repeat(70));
  console.log(
    `${
      `${'Total'.padEnd(28)} ${msOk}/${n}`.padEnd(42) +
      `${buOk}/${n}`.padEnd(14)
    }${shOk}/${n}`,
  );

  // Token comparison
  let msCommon = 0;
  let buCommon = 0;
  let shCommon = 0;
  for (const tid of commonOk) {
    const v = verdicts.find((x) => x.taskId === tid)!;
    msCommon += v.ms.tokens;
    buCommon += v.bu.tokens;
    shCommon += v.sh.tokens;
  }

  console.log(
    `\n=== 口径 B: 三者都 SUCCESS 的任务 (${commonOk.length} 个) ===`,
  );
  if (commonOk.length > 0) {
    console.log(
      `Midscene avg:    ${Math.round(msCommon / commonOk.length).toLocaleString()} tokens`,
    );
    console.log(
      `Browser Use avg: ${Math.round(buCommon / commonOk.length).toLocaleString()} tokens`,
    );
    console.log(
      `Stagehand avg:   ${Math.round(shCommon / commonOk.length).toLocaleString()} tokens`,
    );

    console.log(`\nCommon tasks: ${commonOk.join(', ')}`);
  }

  // Save
  const outPath = path.join(WV, 'results', `judge-2round-${Date.now()}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        judgeModel: JUDGE_MODEL,
        features: [
          'screenshots',
          'realtime-aware',
          'reference-answers',
          'two-round',
        ],
        timestamp: new Date().toISOString(),
        totalTasks: n,
        msSuccess: msOk,
        buSuccess: buOk,
        shSuccess: shOk,
        commonSuccess: commonOk.length,
        commonTasks: commonOk,
        commonAvgTokens: {
          midscene:
            commonOk.length > 0 ? Math.round(msCommon / commonOk.length) : 0,
          browserUse:
            commonOk.length > 0 ? Math.round(buCommon / commonOk.length) : 0,
          stagehand:
            commonOk.length > 0 ? Math.round(shCommon / commonOk.length) : 0,
        },
        verdicts,
      },
      null,
      2,
    ),
  );
  console.log(`\nSaved to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
