import type { Agent } from '@midscene/core';
import { replayError } from './web-page';
import {
  type Resolution,
  type StrictLocate,
  type TargetSample,
  hasGuardIdentity,
  samePoint,
  sampleTarget,
} from './web-target';

/** Strict failures that may be recovered before any dispatch. */
export const RECOVERABLE_CODES = [
  'TARGET_MISSING',
  'TARGET_AMBIGUOUS',
  'TARGET_GUARD_MISMATCH',
];
export const FALLBACK_ACTIONS = ['Tap', 'Hover', 'DoubleClick', 'Input'];

export type FallbackTarget = StrictLocate & { opensPage?: unknown };
export interface Recovery {
  point: NonNullable<TargetSample['point']>;
  ratio: number;
  resolvedBy: 'guard' | 'ai';
  suggestions: string[];
}

/** Configuration errors surface on every run, even when strict XPath succeeds. */
export function validateFallback(action: string, target: FallbackTarget) {
  if (target.fallback === undefined) return;
  if (!['guard', 'locate'].includes(target.fallback))
    throw replayError('INVALID_FALLBACK', { fallback: target.fallback });
  if (!FALLBACK_ACTIONS.includes(action))
    throw replayError('FALLBACK_ACTION_UNSUPPORTED', { action });
  const identity = hasGuardIdentity(target.guard);
  if (target.fallback === 'guard' && !identity)
    throw replayError('FALLBACK_IDENTITY_REQUIRED', {
      reason: 'guard fallback needs guard.text or guard.attr',
    });
  if ((target.sideEffect || target.opensPage) && !identity)
    throw replayError('FALLBACK_IDENTITY_REQUIRED', {
      reason: 'side-effect and popup actions need an exact identity guard',
    });
  if (
    target.fallback === 'locate' &&
    !target.opensPage &&
    typeof target.postcondition !== 'function'
  )
    throw replayError('FALLBACK_POSTCONDITION_REQUIRED');
}

async function stable(
  agent: Agent,
  target: StrictLocate,
  resolution: Resolution,
) {
  const first = await sampleTarget(agent, target, 'action', resolution);
  const second = await sampleTarget(agent, target, 'action', resolution);
  if (!first.point || !second.point || !samePoint(first, second))
    throw replayError('FALLBACK_TARGET_MOVED');
  return second;
}

/** Deterministic tier: the unique guard match inside the scope, no model call. */
export async function recoverByGuard(
  agent: Agent,
  target: StrictLocate,
  editable: boolean,
) {
  return stable(agent, target, { by: 'guard', editable });
}

function bounded<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expiration = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = replayError('FALLBACK_TIMEOUT', { timeoutMs: ms });
      controller.abort(error);
      reject(error);
    }, ms);
  });
  return Promise.race([
    expiration,
    Promise.resolve().then(() => fn(controller.signal)),
  ]).finally(() => clearTimeout(timer));
}

/** Model tier: one bounded aiLocate; the answer must satisfy scope and guard. */
async function recoverByLocate(
  agent: Agent,
  prompt: string,
  target: StrictLocate,
  editable: boolean,
  timeoutMs: number,
) {
  const source = agent.interface;
  const page = (source as { underlyingPage?: unknown }).underlyingPage;
  const fingerprint = (value: TargetSample) =>
    JSON.stringify([value.context, value.geometry]);
  const unchanged = (before: TargetSample, after: TargetSample) => {
    if (
      source !== agent.interface ||
      page !==
        (agent.interface as { underlyingPage?: unknown }).underlyingPage ||
      fingerprint(before) !== fingerprint(after)
    )
      throw replayError('FALLBACK_PAGE_CHANGED');
  };
  return bounded(timeoutMs, async (signal) => {
    const before = await sampleTarget(agent, target, 'fallback-context');
    const uiContext = await agent.getUIContext();
    const ratio = uiContext.shrunkShotToLogicalRatio;
    if (!Number.isFinite(ratio) || ratio <= 0)
      throw replayError('INVALID_SCREENSHOT_SCALE');
    unchanged(before, await sampleTarget(agent, target, 'fallback-context'));
    signal.throwIfAborted();
    const constraints = [
      target.guard?.role && `role ${target.guard.role}`,
      target.guard?.tag && `<${target.guard.tag}> element`,
      target.guard?.text !== undefined &&
        `text ${JSON.stringify(target.guard.text)}`,
      ...Object.entries(target.guard?.attr ?? {}).map(
        ([key, value]) => `${key}=${JSON.stringify(value)}`,
      ),
      editable && 'editable field',
    ].filter(Boolean);
    const located = await agent.aiLocate(
      constraints.length ? `${prompt} (${constraints.join(', ')})` : prompt,
      { uiContext, cacheable: false, abortSignal: signal },
    );
    signal.throwIfAborted();
    if (located?.center?.length !== 2 || !located.center.every(Number.isFinite))
      throw replayError('FALLBACK_NO_POINT');
    // aiLocate returns screenshot pixels; Replay samples CSS pixels.
    const resolution: Resolution = {
      by: 'point',
      x: located.center[0] / ratio,
      y: located.center[1] / ratio,
      editable,
    };
    const sample = await stable(agent, target, resolution);
    signal.throwIfAborted();
    unchanged(before, await sampleTarget(agent, target, 'fallback-context'));
    return { sample, ratio };
  });
}

export async function recoverTarget(
  agent: Agent,
  prompt: string,
  action: string,
  target: StrictLocate,
  options: { timeoutMs: number; ratio: () => Promise<number> },
): Promise<Recovery> {
  const editable = action === 'Input';
  let guardFailure: unknown;
  if (hasGuardIdentity(target.guard)) {
    try {
      const sample = await recoverByGuard(agent, target, editable);
      return {
        point: sample.point!,
        ratio: await options.ratio(),
        resolvedBy: 'guard',
        suggestions: sample.suggestions ?? [],
      };
    } catch (error) {
      guardFailure = error;
      // An identity guard that matches nothing would also reject any AI
      // answer, so only ambiguity is worth a model call.
      if (
        target.fallback !== 'locate' ||
        (error as { code?: string }).code !== 'GUARD_AMBIGUOUS'
      )
        throw error;
    }
  }
  if (target.fallback !== 'locate')
    throw guardFailure ?? replayError('FALLBACK_IDENTITY_REQUIRED');
  const { sample, ratio } = await recoverByLocate(
    agent,
    prompt,
    target,
    editable,
    options.timeoutMs,
  );
  return {
    point: sample.point!,
    ratio,
    resolvedBy: 'ai',
    suggestions: sample.suggestions ?? [],
  };
}
