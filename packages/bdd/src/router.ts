/**
 * Step router for @midscene/bdd.
 *
 * Routing model (design doc): Midscene UI agent by default; `# [agent]` /
 * `$skill` bails a single statement out to the general agent; `# [no-ai]`
 * requires a classic user-registered callback. Exact precedence:
 *
 *   1. @no-ai callback
 *   2. [agent] / $skill general agent
 *   3. flow call
 *   4. default Midscene UI agent (assert for outcome steps, act otherwise)
 */
import { executeFlow } from './flows';
import { matchUserStep, noAiUnmatchedError } from './no-ai';
import { selectSkills } from './skills';
import { ERROR_PREFIX, type RouterContext, type RunStepFn } from './types';

const ACT_LOG_LIMIT = 500;

function appendBlocks(
  text: string,
  dataTable?: string,
  docString?: string,
): string {
  let out = text;
  if (dataTable) out += `\n\nTable:\n${dataTable}`;
  if (docString) out += `\n\n"""\n${docString}\n"""`;
  return out;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Report a @soft check failure without failing the step. */
async function softWarn(
  ctx: RouterContext,
  stepText: string,
  reason?: string,
): Promise<void> {
  const message = `${ERROR_PREFIX} soft check failed: "${stepText}"${reason ? ` — ${reason}` : ''}`;
  await ctx.log?.(message);
  await ctx.attach?.(message, 'text/plain');
}

async function runGeneralAgentStep(ctx: RouterContext): Promise<void> {
  const { stepText } = ctx;
  const skills = selectSkills(ctx.annotations.skills, ctx.skills);
  const prompt = appendBlocks(stepText, ctx.dataTable, ctx.docString);

  // Attach a screenshot only when a UI session already exists — the general
  // agent must never be the reason a browser gets launched.
  let screenshotBase64: string | undefined;
  const ui = ctx.peekUiAgent();
  if (ui?.interface?.screenshotBase64) {
    screenshotBase64 = await ui.interface.screenshotBase64();
  }

  const kind = ctx.stepType === 'outcome' ? 'assert' : 'act';
  const agent = await ctx.getGeneralAgent();
  const result = await agent.run({ kind, prompt, skills, screenshotBase64 });

  if (kind === 'assert') {
    const verdict = result.verdict;
    if (!verdict) {
      throw new Error(
        `${ERROR_PREFIX} General agent reported no verdict for: "${stepText}" — treated as failure (fail-closed).`,
      );
    }
    if (!verdict.pass) {
      if (ctx.annotations.soft) {
        await softWarn(ctx, stepText, verdict.reason);
        return;
      }
      throw new Error(
        `${ERROR_PREFIX} Agent assertion failed: "${stepText}"\nReason: ${verdict.reason}`,
      );
    }
    await ctx.log?.(
      `${ERROR_PREFIX} agent assert PASS: "${stepText}" — ${verdict.reason}`,
    );
    return;
  }

  await ctx.log?.(truncate(result.text, ACT_LOG_LIMIT));
}

export const runStep: RunStepFn = async (ctx) => {
  const { stepText } = ctx;

  // 1. @no-ai: classic user callback; `this` is the step's RouterContext
  // (getUiAgent, attach, log) — not the cucumber World instance.
  if (ctx.annotations.noAi) {
    const match = matchUserStep(stepText);
    if (!match) throw noAiUnmatchedError(stepText);
    await match.def.fn.apply(ctx, match.args);
    return;
  }

  // 2. [agent] / $skill: bail this one statement out to the general agent.
  if (ctx.annotations.agent || ctx.annotations.skills.length > 0) {
    await runGeneralAgentStep(ctx);
    return;
  }

  // 3. Flow call (matchStep throws on ambiguity itself).
  const flowMatch = ctx.flows.matchStep(stepText);
  if (flowMatch) {
    await executeFlow(flowMatch, ctx, runStep);
    return;
  }

  // 4. Default: Midscene UI agent.
  const ui = await ctx.getUiAgent();
  const prompt = appendBlocks(stepText, ctx.dataTable, ctx.docString);
  switch (ctx.stepType) {
    case 'outcome': {
      if (ctx.annotations.soft) {
        const raw = (await ui.aiAssert(prompt, undefined, {
          keepRawResponse: true,
        })) as
          | { pass?: boolean; thought?: string; message?: string }
          | undefined;
        if (raw?.pass !== true) {
          await softWarn(ctx, stepText, raw?.thought ?? raw?.message);
        }
        return;
      }
      // Core throws with the model's reason — fail-closed by construction.
      await ui.aiAssert(prompt);
      return;
    }
    case 'context':
    case 'action':
    case 'unknown':
      await ui.aiAct(prompt);
      return;
    default: {
      const exhaustive: never = ctx.stepType;
      throw new Error(
        `${ERROR_PREFIX} Unhandled step type: ${String(exhaustive)}`,
      );
    }
  }
};
