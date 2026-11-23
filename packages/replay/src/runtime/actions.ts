import { AsyncLocalStorage } from 'node:async_hooks';
import type { Agent } from '@midscene/core';
import { describeError } from '../verification/diagnostic';
import {
  RECOVERABLE_CODES,
  type Recovery,
  recoverByGuard,
  recoverTarget,
  validateFallback,
} from './fallback';
import { assertPopupHost, followPopup } from './popup';
import {
  deadlineAfter,
  isNavigationRace,
  matchesUrl,
  normalizeUrlMatch,
  poll,
  replayError,
} from './web-page';
import {
  type Locator,
  type Point,
  type SelectOption,
  type StrictLocate,
  type TargetSample,
  hasGuardIdentity,
  samePoint,
  sampleExpression,
  sampleTarget,
} from './web-target';
import type { ReplayEvidence } from './with-replay';

export type TapTarget = StrictLocate & {
  /** Expected final URL of a popup opened by this click; never retry the click. */
  opensPage?: (
    | { url: string }
    | { match: { origin: string; pathname: string } }
  ) & {
    timeoutMs?: number;
  };
};
export type SelectTarget = Omit<StrictLocate, 'fallback'> & {
  option: SelectOption;
};

type ScrollIntoViewOptions = {
  target: Locator | Pick<StrictLocate, 'candidates' | 'within' | 'guard'>;
  container?: Locator;
  timeoutMs?: number;
};
// Share the policy across the CLI ESM entry and scripts loading the CJS SDK.
const policyKey = Symbol.for('midscene.replay.fallbackDisabled');
const runtime = globalThis as typeof globalThis & {
  [policyKey]?: AsyncLocalStorage<boolean>;
};
runtime[policyKey] ??= new AsyncLocalStorage<boolean>();
const fallbackDisabled = runtime[policyKey];
export function withoutReplayFallback<T>(operation: () => T): T {
  return fallbackDisabled.run(true, operation);
}

export function createReplayActions(
  agent: Agent,
  options: { timeoutMs?: number; fallbackTimeoutMs?: number },
  { publish, report, reportFailure }: ReplayEvidence,
  {
    preflightHost,
    markDispatch,
    waitFor,
  }: {
    preflightHost(): Promise<void>;
    markDispatch(): void;
    waitFor(expression: string, options: { timeoutMs: number }): Promise<void>;
  },
) {
  let scale:
    | { page: Agent['interface']; key: string; ratio: number }
    | undefined;
  const retryable = (error: unknown) =>
    isNavigationRace(error) ||
    [
      'TARGET_MISSING',
      'SCOPE_MISSING',
      'TARGET_NOT_INTERACTABLE',
      'TARGET_MOVED',
    ].includes((error as { code?: string })?.code ?? '');

  const fallbackAllowed = () =>
    !fallbackDisabled.getStore() &&
    process.env.MIDSCENE_REPLAY_FALLBACK !== 'off';

  async function checkPostcondition(
    action: string,
    prompt: string,
    resolvedBy: string,
    postcondition: StrictLocate['postcondition'],
  ) {
    if (!postcondition) return;
    try {
      await postcondition();
    } catch (cause) {
      return reportFailure(
        {
          type: 'postcondition',
          action,
          prompt,
          resolvedBy,
          dispatch: 'completed',
          reason: String(cause),
        },
        Object.assign(new Error('POSTCONDITION_FAILED', { cause }), {
          code: 'POSTCONDITION_FAILED',
          dispatch: 'completed',
          resolvedBy,
        }),
      );
    }
  }

  async function screenshotRatio() {
    const context = await agent.getUIContext();
    const ratio = context.shrunkShotToLogicalRatio;
    if (!Number.isFinite(ratio) || ratio <= 0)
      throw replayError('INVALID_SCREENSHOT_SCALE');
    return ratio;
  }

  async function strictLocation(target: StrictLocate) {
    const deadline = deadlineAfter(
      target.timeoutMs ?? options.timeoutMs ?? 5000,
    );
    return poll(
      deadline,
      async () => {
        const sampled = await sampleTarget(agent, target, 'action');
        const key = JSON.stringify([
          sampled.geometry,
          agent.opts?.screenshotShrinkFactor,
        ]);
        if (!scale || scale.page !== agent.interface || scale.key !== key)
          scale = {
            page: agent.interface,
            key,
            ratio: await screenshotRatio(),
          };
        const checked = await sampleTarget(agent, target, 'action');
        if (!checked.point || !samePoint(sampled, checked))
          throw replayError('TARGET_MOVED');
        return { point: checked.point, ratio: scale.ratio };
      },
      () => {
        throw replayError('TARGET_MOVED');
      },
      retryable,
    );
  }

  /** Recovery hint for strict runs: never dispatches, never calls a model. */
  async function healHint(action: string, target: StrictLocate) {
    if (!hasGuardIdentity(target.guard)) return undefined;
    try {
      const sample = await recoverByGuard(agent, target, action === 'Input');
      return { resolvedBy: 'guard', suggestions: sample.suggestions ?? [] };
    } catch (error) {
      return { error: (error as { code?: string }).code ?? String(error) };
    }
  }

  async function dispatch(
    action: string,
    prompt: string,
    target: TapTarget,
    parameters: Record<string, unknown> = {},
    aroundAction?: (action: () => Promise<void>) => Promise<void>,
    afterAction?: () => Promise<void>,
  ) {
    const { postcondition, opensPage, ...located } = target;
    const details = {
      type: 'action',
      action,
      prompt,
      target: located,
    };
    const started = performance.now();
    let location: { point: Point; ratio: number };
    let resolvedBy: 'xpath' | Recovery['resolvedBy'] = 'xpath';
    try {
      await preflightHost();
      validateFallback(action, target);
      if (opensPage && !aroundAction)
        throw replayError('INVALID_POPUP_DESTINATION');
      try {
        location = await strictLocation(located);
      } catch (error) {
        const code = (error as { code?: string }).code ?? '';
        if (!RECOVERABLE_CODES.includes(code)) throw error;
        if (!target.fallback || !fallbackAllowed()) {
          const heal = await healHint(action, located);
          if (heal) {
            publish({ type: 'heal', prompt, original: code, ...heal });
            Object.assign(error as object, { heal });
          }
          throw error;
        }
        const fallbackStarted = performance.now();
        const diagnostic = {
          type: 'fallback',
          action,
          prompt,
          mode: target.fallback,
          target: located,
          original: describeError(error),
        };
        let recovery: Recovery;
        try {
          recovery = await recoverTarget(agent, prompt, action, located, {
            timeoutMs: options.fallbackTimeoutMs ?? 15000,
            ratio: screenshotRatio,
          });
        } catch (cause) {
          const reason = describeError(cause);
          publish({
            ...diagnostic,
            result: 'rejected',
            dispatch: 'not-sent',
            reason,
            durationMs: performance.now() - fallbackStarted,
          });
          throw replayError('FALLBACK_REJECTED', {
            original: diagnostic.original,
            reason,
          });
        }
        // Keep screenshot/report I/O out of the gap before dispatch.
        publish({
          ...diagnostic,
          result: 'resolved',
          resolvedBy: recovery.resolvedBy,
          point: recovery.point,
          suggestions: recovery.suggestions,
          durationMs: performance.now() - fallbackStarted,
        });
        location = recovery;
        resolvedBy = recovery.resolvedBy;
      }
    } catch (error) {
      return reportFailure(
        { ...details, dispatch: 'not-sent', reason: String(error) },
        error,
      );
    }

    const { point, ratio } = location;
    const readyMs = performance.now() - started;
    let dispatchState = 'not-sent';
    try {
      const send = async () => {
        dispatchState = 'unknown';
        markDispatch();
        await agent.callActionInActionSpace(
          action,
          {
            locate: {
              prompt,
              cacheable: false,
              locatedPixelResult: {
                center: [point.x * ratio, point.y * ratio],
              },
            },
            ...parameters,
          },
          undefined,
          { skipDefaultWait: true, deferModelResolution: true },
        );
        dispatchState = 'completed';
      };
      if (aroundAction) await aroundAction(send);
      else await send();
    } catch (cause) {
      const error = Object.assign(new Error('DISPATCH_FAILED', { cause }), {
        code: 'DISPATCH_FAILED',
        dispatch: dispatchState,
      });
      return reportFailure(
        {
          ...details,
          point,
          resolvedBy,
          dispatch: dispatchState,
          reason: String(cause),
        },
        error,
      );
    }
    await report({
      ...details,
      point,
      resolvedBy,
      dispatch: 'completed',
      readyMs,
      durationMs: performance.now() - started,
    });
    await afterAction?.();
    await checkPostcondition(action, prompt, resolvedBy, postcondition);
  }
  function scroll(
    prompt: string,
    target: StrictLocate & {
      direction: 'up' | 'down' | 'left' | 'right';
      distance: number;
    },
  ) {
    const { direction, distance, ...locator } = target;
    if (!Number.isFinite(distance) || distance <= 0)
      throw new Error('scroll requires a positive distance');
    return dispatch('Scroll', prompt, locator, {
      direction,
      distance,
      scrollType: 'singleAction',
    });
  }

  return {
    async tap(prompt: string, target: TapTarget) {
      const { opensPage, ...locator } = target;
      if (!opensPage) return dispatch('Tap', prompt, locator);
      assertPopupHost(agent);
      const timeoutMs = opensPage.timeoutMs ?? options.timeoutMs ?? 5000;
      deadlineAfter(timeoutMs);
      if ('url' in opensPage === 'match' in opensPage)
        throw replayError('INVALID_POPUP_DESTINATION');
      const url = normalizeUrlMatch(
        'url' in opensPage ? opensPage.url : opensPage.match,
      );
      if (typeof url === 'object' && !(url.origin && url.pathname))
        throw replayError('INVALID_POPUP_DESTINATION');
      let started = performance.now();
      await dispatch(
        'Tap',
        prompt,
        target,
        {},
        async (send) => {
          // Readiness has its own budget. Listen immediately before the click.
          started = performance.now();
          await followPopup(agent, send, timeoutMs);
        },
        async () => {
          const event = { type: 'new-page', prompt, url };
          try {
            await waitFor(
              `(${matchesUrl.toString()})(location.href,${JSON.stringify(url)}) && document.readyState !== 'loading'`,
              {
                timeoutMs: Math.max(
                  0,
                  timeoutMs - (performance.now() - started),
                ),
              },
            );
            await report({
              ...event,
              actualUrl: await agent.evaluateJavaScript('location.href'),
              durationMs: performance.now() - started,
            });
          } catch (error) {
            return reportFailure(
              {
                ...event,
                dispatch: 'completed',
                error: describeError(error, 'new-page'),
              },
              error,
            );
          }
        },
      );
    },
    hover: (prompt: string, target: StrictLocate) =>
      dispatch('Hover', prompt, target),
    doubleClick: (prompt: string, target: StrictLocate) =>
      dispatch('DoubleClick', prompt, target),
    input: (
      prompt: string,
      target: StrictLocate & {
        value: string;
        inputStrategy?: 'legacy' | 'sequential' | 'bulk';
      },
    ) => {
      const { value, inputStrategy, ...locator } = target;
      if (typeof value !== 'string')
        throw new TypeError('input requires a string value');
      return dispatch('Input', prompt, locator, {
        value,
        ...(inputStrategy ? { inputStrategy } : {}),
      });
    },
    async select(prompt: string, target: SelectTarget) {
      const { option, postcondition, ...located } = target;
      const details = {
        type: 'action',
        action: 'Select',
        prompt,
        target: located,
        option,
      };
      const started = performance.now();
      let mayHaveDispatched = false;
      let sample: TargetSample;
      try {
        await preflightHost();
        validateFallback('Select', target);
        if (
          !option ||
          !(
            (typeof option.value === 'string' && option.label === undefined) ||
            (typeof option.label === 'string' && option.value === undefined)
          )
        )
          throw replayError('INVALID_SELECT_OPTION');
        const deadline = deadlineAfter(
          target.timeoutMs ?? options.timeoutMs ?? 5000,
        );
        // Wait for the control and exact option with read-only samples so a
        // navigation race during readiness retries without marking a dispatch.
        await poll(
          deadline,
          async () => {
            const ready = await sampleTarget(
              agent,
              located,
              'select-ready',
              undefined,
              option,
            );
            if (!ready.point) throw replayError('INVALID_SELECT_RESULT');
            return ready;
          },
          () => {
            throw replayError('TARGET_NOT_INTERACTABLE');
          },
          retryable,
        );
        const source = sampleExpression(located, 'select', undefined, option);
        mayHaveDispatched = true;
        const result: TargetSample = await agent.evaluateJavaScript(source);
        if (result.error) {
          mayHaveDispatched = false;
          throw replayError(result.error.code, result.error.details);
        }
        if (!result.point) throw replayError('INVALID_SELECT_RESULT');
        sample = result;
      } catch (error) {
        if (mayHaveDispatched) markDispatch();
        return reportFailure(
          {
            ...details,
            dispatch: mayHaveDispatched ? 'unknown' : 'not-sent',
            reason: String(error),
          },
          error,
        );
      }
      markDispatch();
      await report(
        {
          ...details,
          point: sample.point,
          resolvedBy: 'xpath',
          dispatch: 'completed',
          durationMs: performance.now() - started,
        },
        undefined,
        `Select · ${prompt}`,
      );
      await checkPostcondition('Select', prompt, 'xpath', postcondition);
    },
    keyPress: (prompt: string, target: StrictLocate & { keyName: string }) => {
      const { keyName, ...locator } = target;
      if (!keyName?.trim()) throw new Error('keyPress requires keyName');
      return dispatch('KeyboardPress', prompt, locator, { keyName });
    },
    scroll,
    async scrollIntoView(
      prompt: string,
      {
        target,
        container,
        timeoutMs = options.timeoutMs ?? 5000,
      }: ScrollIntoViewOptions,
    ) {
      await preflightHost();
      const locate: StrictLocate =
        'candidates' in target ? target : { candidates: [target] };
      const deadline = deadlineAfter(timeoutMs);
      const sample = () =>
        poll(
          deadline,
          async () =>
            (
              await sampleTarget(
                agent,
                { ...locate, scrollContainer: container },
                'reveal',
              )
            ).reveal,
          () => {
            throw replayError('SCROLL_TARGET_NOT_VISIBLE');
          },
          retryable,
        );
      let previous;
      for (let moves = 0; moves <= 4; moves++) {
        const current = await sample();
        if (!current.motion) return;
        if (
          moves === 4 ||
          (previous &&
            (performance.now() >= deadline ||
              (previous[0] === current.offset[0] &&
                previous[1] === current.offset[1])))
        )
          throw replayError('SCROLL_TARGET_NOT_VISIBLE', { target, container });
        previous = current.offset;
        await scroll(prompt, {
          candidates: [container ?? { xpath: '//html' }],
          timeoutMs: Math.max(0, deadline - performance.now()),
          ...current.motion,
        });
      }
    },
  };
}
