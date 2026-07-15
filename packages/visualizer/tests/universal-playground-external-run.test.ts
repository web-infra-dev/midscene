import { describe, expect, it } from 'vitest';
import {
  preparePlaygroundExecution,
  shouldExecuteExternalRunRequest,
} from '../src/component/universal-playground/external-run';

describe('preparePlaygroundExecution', () => {
  it('clears the previous timeline after sibling execution cleanup', async () => {
    const events: string[] = [];

    await preparePlaygroundExecution({
      clearTimeline: async () => {
        events.push('clear');
      },
      clearTimelineBeforeRun: true,
      onBeforeExecutionStart: async () => {
        events.push('before');
      },
    });

    expect(events).toEqual(['before', 'clear']);
  });

  it('preserves the timeline unless clearing is enabled', async () => {
    const clearTimeline = async () => {
      throw new Error('timeline should not be cleared');
    };

    await expect(
      preparePlaygroundExecution({ clearTimeline }),
    ).resolves.toBeUndefined();
  });
});

describe('shouldExecuteExternalRunRequest', () => {
  const request = {
    id: 'replay-1',
    value: { type: 'runYaml', prompt: 'web:\n  url: example' },
    displayContent: 'Imported YAML Replay: replay.yaml',
  };

  it('waits until initial messages are ready before executing', () => {
    expect(
      shouldExecuteExternalRunRequest({
        request,
        lastRequestId: null,
        sdkReady: true,
        messagesInitialized: false,
      }),
    ).toBe(false);
  });

  it('executes a fresh request once SDK and messages are ready', () => {
    expect(
      shouldExecuteExternalRunRequest({
        request,
        lastRequestId: null,
        sdkReady: true,
        messagesInitialized: true,
      }),
    ).toBe(true);
  });

  it('does not execute the same request twice', () => {
    expect(
      shouldExecuteExternalRunRequest({
        request,
        lastRequestId: 'replay-1',
        sdkReady: true,
        messagesInitialized: true,
      }),
    ).toBe(false);
  });

  it('does not execute a request already handled by another playground instance', () => {
    expect(
      shouldExecuteExternalRunRequest({
        request,
        handledRequestIds: new Set(['replay-1']),
        lastRequestId: null,
        sdkReady: true,
        messagesInitialized: true,
      }),
    ).toBe(false);
  });
});
