import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);
const require = createRequire(
  path.join(root, 'packages/web-integration/package.json'),
);
require('dotenv').config({ path: path.join(root, '.env'), override: true });
const core = (name) => require(path.join(root, 'packages/core/dist/lib', name));
const { ConversationHistory, standardPlan, getModelRuntime } =
  core('ai-model/index.js');
const { prepareUserPrompt } = core('ai-model/shared/multimodal-prompt.js');
const { reviewScroll, scrollReviewFeedback } = core(
  'ai-model/workflows/planning/scroll-review.js',
);
const { ScreenshotItem } = core('screenshot-item.js');
const {
  defineActionTap,
  defineActionInput,
  defineActionKeyboardPress,
  defineActionScroll,
  defineActionSleep,
} = core('device/index.js');
const { globalModelConfigManager } = require(
  path.join(root, 'packages/shared/dist/lib/env/index.js'),
);
const { imageInfoOfBase64 } = require(
  path.join(root, 'packages/shared/dist/lib/img/index.js'),
);
const input = process.env.EVAL_REPLAY_DIR;
if (!input)
  throw new Error('Set EVAL_REPLAY_DIR to an external replay fixture');
const c = JSON.parse(await readFile(path.join(input, 'case.json'), 'utf8'));
if (
  typeof c.prompt !== 'string' ||
  !Number.isInteger(c.beforeTaskIndex) ||
  !Number.isInteger(c.previousPlanIndex) ||
  !Array.isArray(c.historyLogs) ||
  !Array.isArray(c.allowedDirections)
)
  throw new Error('Invalid replay case manifest');
const dump = JSON.parse(await readFile(path.join(input, 'dump.json'), 'utf8'));
const tasks = dump.executions[0].tasks;
const task = tasks[c.beforeTaskIndex];
task.uiContext.screenshot = ScreenshotItem.create(
  task.uiContext.screenshot.base64,
  Date.now(),
);
const bytes = await readFile(path.join(input, c.afterImage));
const base64 = `data:image/${c.afterImage.endsWith('.png') ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
const current = {
  screenshot: ScreenshotItem.create(base64, Date.now()),
  shotSize: await imageInfoOfBase64(base64),
  shrunkShotToLogicalRatio: 1,
};
const runtime = getModelRuntime(
  globalModelConfigManager.getModelConfig('default'),
);
const prompt = await prepareUserPrompt(c.prompt);
const out = path.join(
  path.resolve(process.env.MIDSCENE_RUN_DIR || path.join(root, 'midscene_run')),
  'test-results',
  'scroll-recovery-evaluation',
  `replay-${Date.now()}`,
);
await mkdir(out, { recursive: true });
console.log(`EVAL_OUTPUT ${out}`);
const reps = Number(process.env.EVAL_REPETITIONS || 5);
if (!Number.isSafeInteger(reps) || reps < 1)
  throw new Error('Invalid repetitions');
await writeFile(
  path.join(out, 'manifest.json'),
  JSON.stringify(
    {
      model: runtime.config.modelName,
      family: runtime.config.modelFamily,
      reps,
      arms: ['off', 'feedback', 'full'],
      note: 'Planning-only development replay. Shared observer evidence within each repetition isolates the history-projection ablation. Not real-site task completion.',
    },
    null,
    2,
  ),
);
for (let rep = 0; rep < reps; rep++) {
  let review;
  let reviewError;
  try {
    review = await reviewScroll({
      task,
      current,
      modelRuntime: runtime,
      abortSignal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    reviewError = error.message;
  }
  await appendFile(
    path.join(out, 'observations.jsonl'),
    `${JSON.stringify({ rep, content: review?.content, usage: review?.usage, error: reviewError })}\n`,
  );
  const arms = ['off', 'feedback', 'full'];
  const offset = rep % 3;
  for (const arm of [...arms.slice(offset), ...arms.slice(0, offset)]) {
    const history = new ConversationHistory();
    history.appendMessage({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<execution_history>${c.historyLogs.join('\n')}</execution_history>This is the screenshot before the previous Scroll.`,
        },
        { type: 'image', url: task.uiContext.screenshot.base64 },
      ],
    });
    history.appendMessage({
      role: 'assistant',
      content: tasks[c.previousPlanIndex].log.rawResponse
        .replaceAll('__midscene_lt__', '<')
        .replaceAll('__midscene_gt__', '>'),
    });
    c.historyLogs.forEach((log) => history.appendHistoricalLog(log));
    const unchanged = review?.content.progress === 'unchanged';
    if (arm !== 'off' && unchanged)
      history.pendingFeedbackMessage = scrollReviewFeedback(review.content);
    let record = { rep, arm, review: arm === 'off' ? null : review?.content };
    try {
      if (arm !== 'off' && reviewError)
        throw new Error(`Observer failed: ${reviewError}`);
      const result = await standardPlan(prompt, {
        context: current,
        actionSpace: [
          defineActionTap(async () => {}),
          defineActionInput(async () => {}),
          defineActionKeyboardPress(async () => {}),
          defineActionScroll(async () => {}),
          defineActionSleep(async () => {}),
        ],
        modelRuntime: runtime,
        conversationHistory: history,
        includeLocateInPlanning: true,
        effort: 'balance',
        imagesIncludeCount: 1,
        reassessScroll: arm === 'full' && unchanged,
        abortSignal: AbortSignal.timeout(90000),
      });
      const action = result.actions?.[0];
      const boundary = {
        scrollToRight: 'right',
        scrollToLeft: 'left',
        scrollToTop: 'up',
        scrollToBottom: 'down',
      };
      record = {
        ...record,
        action,
        correct:
          action?.type === 'Scroll' &&
          c.allowedDirections.includes(
            boundary[action.param.scrollType] || action.param.direction,
          ),
        usage: result.usage,
        thought: result.thought,
      };
    } catch (e) {
      record = { ...record, error: e.message, correct: false };
    }
    await appendFile(
      path.join(out, 'results.jsonl'),
      `${JSON.stringify(record)}\n`,
    );
    console.log(rep, arm, record.correct, record.error || '');
  }
}
