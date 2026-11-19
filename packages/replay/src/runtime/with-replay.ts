import { channel } from 'node:diagnostics_channel';
import type { Agent } from '@midscene/core';
import { describeError } from '../verification/diagnostic';
import { createReplayActions } from './actions';
import { createReplayChecks } from './checks';
import type { VerdictJudge } from './judge';
import { assertPopupHost } from './popup';
import { replayError } from './web-page';

export interface ReplayRequirements {
  popups?: boolean;
  minViewport?: { width: number; height: number };
}
export async function checkReplayHost(
  agent: Agent,
  requires?: ReplayRequirements,
) {
  if (requires?.popups) {
    try {
      assertPopupHost(agent);
    } catch {
      throw replayError('HOST_UNSUPPORTED', { requires: 'popup following' });
    }
  }
  if (requires?.minViewport) {
    const { width, height } = requires.minViewport;
    if (
      ![width, height].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    )
      throw replayError('INVALID_REPLAY_VIEWPORT');
    const actual = await agent.evaluateJavaScript(
      '({width: innerWidth, height: innerHeight})',
    );
    if (
      !actual ||
      !Number.isFinite(actual.width) ||
      !Number.isFinite(actual.height) ||
      actual.width < width ||
      actual.height < height
    )
      throw replayError('HOST_UNSUPPORTED', {
        requires: requires.minViewport,
        actual,
      });
  }
}
/** Identity of the step currently executing, attached to every event. */
export interface StepRef {
  number: number;
  id: string;
  title: string;
  attempt: number;
}

export const replayEvents = channel('midscene.replay');

export interface ReplayEvidence {
  publish(event: Record<string, unknown>): void;
  report(
    event: Record<string, unknown>,
    screenshot?: string,
    nativeTitle?: string,
  ): Promise<void>;
  reportFailure(
    event: Record<string, unknown>,
    failure: unknown,
  ): Promise<never>;
}

type ReplayOptions = {
  judge?: VerdictJudge;
  timeoutMs?: number;
  /** Budget for one AI locate fallback. Default 15000 ms. */
  fallbackTimeoutMs?: number;
  requires?: ReplayRequirements;
};

export function createReplayRuntime(agent: Agent, options: ReplayOptions) {
  let step: StepRef | undefined;
  let dispatches = 0;
  let preflight: Promise<void> | undefined;
  const publish: ReplayEvidence['publish'] = (event) =>
    replayEvents.publish({ agent, event: { ...event, step } });

  async function report(
    event: Record<string, unknown>,
    screenshot?: string,
    nativeTitle?: string,
  ) {
    event = { ...event, ...(step ? { step } : {}) };
    replayEvents.publish({ agent, event, screenshot });
    // ActionSpace already records its actions. Page-native actions opt in
    // explicitly, since recordToReport captures a screenshot of its own.
    if (
      !nativeTitle &&
      !screenshot &&
      !(event.type === 'new-page' && event.error) &&
      event.dispatch !== 'not-sent' &&
      event.dispatch !== 'unknown'
    )
      return;
    await agent.recordToReport(
      `${step ? `${step.number}. ${step.title} · ` : ''}Replay · ${nativeTitle ?? event.type}`,
      {
        content: JSON.stringify(event),
        ...(screenshot ? { screenshots: [{ base64: screenshot }] } : {}),
      },
    );
  }
  async function reportFailure(
    event: Record<string, unknown>,
    failure: unknown,
  ): Promise<never> {
    try {
      await report(event);
    } catch (reportError) {
      publish({ type: 'evidence-error', error: describeError(reportError) });
    }
    throw failure;
  }

  async function preflightHost() {
    if (options.requires) {
      preflight ??= checkReplayHost(agent, options.requires);
      await preflight;
    }
  }

  const evidence: ReplayEvidence = { publish, report, reportFailure };
  const checks = createReplayChecks(agent, options, evidence);
  const actions = createReplayActions(agent, options, evidence, {
    preflightHost,
    markDispatch() {
      dispatches++;
    },
    waitFor: checks.waitFor,
  });
  return {
    replay: { ...actions, ...checks },
    setStep(value: StepRef | undefined) {
      step = value;
    },
    dispatches: () => dispatches,
  };
}

export function withReplay(agent: Agent, options: ReplayOptions = {}) {
  return createReplayRuntime(agent, options).replay;
}

export type Replay = ReturnType<typeof withReplay>;
