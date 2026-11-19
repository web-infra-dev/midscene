import { deepStrictEqual } from 'node:assert/strict';
import type { Agent } from '@midscene/core';
import { describeError } from '../verification/diagnostic';
import { replayJevConfig } from './jev';
import {
  type VerdictJudge,
  type VerdictState,
  createReplayJev,
  digest,
  imageBytes,
} from './judge';
import {
  type UrlMatch,
  deadlineAfter,
  isNavigationRace,
  matchesUrl,
  normalizeUrlMatch,
  pageFunction,
  poll,
  replayError,
} from './web-page';
import {
  type ElementState,
  type Locator,
  type StrictLocate,
  sampleTarget,
} from './web-target';
import type { ReplayEvidence } from './with-replay';

type WaitOptions<Args extends unknown[]> = { args?: Args; timeoutMs?: number };

export interface Verdict {
  state: VerdictState;
  judge: { model: string; detects: VerdictJudge['detects'] };
  reason?: string;
  signals?: Record<string, number>;
}
export class VerifyError extends Error {
  readonly code: string;
  constructor(readonly verdict: Verdict) {
    const code = `VERIFY_${verdict.state.toUpperCase()}`;
    super(code + (verdict.reason ? `: ${verdict.reason}` : ''));
    this.code = code;
  }
}

export function createReplayChecks(
  agent: Agent,
  options: { judge?: VerdictJudge },
  { publish, report }: ReplayEvidence,
) {
  let judgePromise: Promise<VerdictJudge> | undefined;
  const checks = {
    /** Read page state without creating a Replay event or screenshot. */
    async read<Args extends unknown[], T>(
      read: (...args: Args) => T,
      options: { args?: Args } = {},
    ): Promise<T> {
      return agent.evaluateJavaScript(
        pageFunction(read, options.args ?? ([] as unknown as Args)),
      );
    },
    async checkpoint<Args extends unknown[], T>(
      title: string,
      read: (...args: Args) => T,
      options: { args?: Args; expect?: T; screenshot?: boolean } = {},
    ): Promise<T> {
      const actual = await checks.read(read, options);
      const event = { type: 'checkpoint', title, actual, status: 'observed' };
      let failure: unknown;
      if ('expect' in options) {
        try {
          deepStrictEqual(actual, options.expect, title);
          event.status = 'passed';
        } catch (error) {
          event.status = 'failed';
          failure = error;
        }
      }
      if (options.screenshot || failure) {
        try {
          await report(event, await agent.interface.screenshotBase64());
        } catch (error) {
          if (!failure) throw error;
          publish({ ...event, evidenceError: describeError(error) });
        }
      } else {
        await report(event);
      }
      if (failure) throw failure;
      return actual;
    },
    async waitFor<Args extends unknown[]>(
      expression: string | ((...args: Args) => unknown),
      { timeoutMs = 0, args }: WaitOptions<Args> = {},
    ) {
      const source =
        typeof expression === 'string'
          ? expression.trim()
          : pageFunction(expression, args ?? ([] as unknown as Args));
      if (!source) throw replayError('INVALID_WAIT_CONDITION');
      const started = performance.now();
      const condition =
        typeof expression === 'string'
          ? source
          : expression.name || 'page function';
      await poll(
        deadlineAfter(timeoutMs),
        async () =>
          (await agent.evaluateJavaScript(`Boolean(${source})`))
            ? true
            : undefined,
        () => {
          throw replayError('WAIT_TIMEOUT', { condition });
        },
      );
      await report({
        type: 'wait',
        condition,
        durationMs: performance.now() - started,
      });
    },
    async waitForUrl(expected: UrlMatch, { timeoutMs = 0 } = {}) {
      const match = normalizeUrlMatch(expected);
      await checks.waitFor(
        `(${matchesUrl.toString()})(location.href,${JSON.stringify(match)})`,
        { timeoutMs },
      );
    },
    async inspect(
      locator: Locator | StrictLocate,
      opts?: { within?: Locator; timeoutMs?: number },
    ): Promise<ElementState> {
      const target =
        'candidates' in locator
          ? locator
          : { candidates: [locator] as [Locator] };
      const deadline = deadlineAfter(opts?.timeoutMs ?? target.timeoutMs ?? 0);
      return poll(
        deadline,
        async () =>
          (
            await sampleTarget(
              agent,
              { ...target, ...(opts?.within && { within: opts.within }) },
              'inspect',
            )
          ).state,
        () => {
          throw replayError('TARGET_MISSING');
        },
        (error) =>
          isNavigationRace(error) ||
          ['TARGET_MISSING', 'SCOPE_MISSING'].includes(
            (error as { code?: string }).code ?? '',
          ),
      );
    },
    async expect(
      locator: Locator | StrictLocate,
      expected: Partial<ElementState>,
      opts?: { within?: Locator; timeoutMs?: number },
    ) {
      let actual: ElementState | undefined;
      const timeoutMs =
        opts?.timeoutMs ??
        ('timeoutMs' in locator ? locator.timeoutMs : undefined) ??
        0;
      return poll(
        deadlineAfter(timeoutMs),
        async () => {
          actual = await checks.inspect(locator, { ...opts, timeoutMs: 0 });
          const matching = Object.keys(expected).every((key) => {
            const field = key as keyof ElementState;
            try {
              deepStrictEqual(actual?.[field], expected[field]);
              return true;
            } catch {
              return false;
            }
          });
          return matching ? actual : undefined;
        },
        () => {
          throw replayError('EXPECT_TIMEOUT', { expected, actual });
        },
        (error) =>
          isNavigationRace(error) ||
          ['TARGET_MISSING', 'SCOPE_MISSING'].includes(
            (error as { code?: string }).code ?? '',
          ),
      );
    },
    async verify(
      criterion: string,
      { settleTimeoutMs = 0 } = {},
    ): Promise<Verdict> {
      if (
        !criterion.trim() ||
        !Number.isFinite(settleTimeoutMs) ||
        settleTimeoutMs < 0
      )
        throw new Error(
          'Expected a criterion and a non-negative settle timeout',
        );
      if (!options.judge && !judgePromise) {
        const selected = replayJevConfig(
          agent.modelConfigManager.getModelConfig('insight'),
        );
        if (!selected)
          throw Object.assign(
            new Error(
              'Replay verify requires Jev. Configure the host Agent insight model with MIDSCENE_INSIGHT_MODEL_FAMILY=jev, or use default OpenRouter credentials. General-model fallback is disabled.',
            ),
            { code: 'REPLAY_JEV_REQUIRED' },
          );
        judgePromise = createReplayJev(selected);
      }
      const judge = options.judge ?? (await judgePromise!);
      const until = performance.now() + settleTimeoutMs;
      while (true) {
        const base64 = await agent.interface.screenshotBase64();
        let judged: Awaited<ReturnType<VerdictJudge['judge']>>;
        try {
          judged = await judge.judge({
            criterion,
            frames: [{ base64 }],
            purpose: 'assert',
          });
        } catch (error) {
          const failed = error as {
            evaluatedImage?: string;
            preparation?: unknown;
          };
          await report(
            {
              type: 'verify',
              criterion,
              error: describeError(error),
              preparation: failed.preparation,
              imageRole: failed.evaluatedImage ? 'prepared' : 'source',
            },
            failed.evaluatedImage ?? base64,
          );
          throw error;
        }
        const { evaluatedImage = base64, preparation, ...result } = judged;
        const verdict = {
          ...result,
          judge: { model: judge.model, detects: judge.detects },
        };
        await report(
          {
            type: 'verify',
            criterion,
            verdict,
            preparation,
            imageHash: digest(imageBytes(evaluatedImage)),
          },
          evaluatedImage,
        );
        if (verdict.state === 'pass') return verdict;
        if (verdict.state !== 'pending' || performance.now() >= until)
          throw new VerifyError(verdict);
        await new Promise((done) =>
          setTimeout(done, Math.min(200, until - performance.now())),
        );
        if (performance.now() >= until) throw new VerifyError(verdict);
      }
    },
  };
  return checks;
}
