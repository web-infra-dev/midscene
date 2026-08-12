/** @vitest-environment jsdom */
import type { DescribeRecorderUIEventsResult } from '@shared/electron-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeStudioRecorderEventsWithAI } from '../src/renderer/recorder/codegen';

afterEach(() => {
  Reflect.deleteProperty(window, 'studioRuntime');
});

describe('Studio recorder renderer codegen', () => {
  it('cancels the Electron description job when the caller aborts', async () => {
    let finishDescription!: (result: DescribeRecorderUIEventsResult) => void;
    const describeRecorderUIEvents = vi.fn(
      () =>
        new Promise<DescribeRecorderUIEventsResult>((resolve) => {
          finishDescription = resolve;
        }),
    );
    const cancelDescribeRecorderUIEvents = vi.fn(async () => {
      finishDescription({ events: [], results: [] });
      return { cancelled: true };
    });
    window.studioRuntime = {
      describeRecorderUIEvents,
      cancelDescribeRecorderUIEvents,
    } as typeof window.studioRuntime;
    const controller = new AbortController();
    const promise = describeStudioRecorderEventsWithAI(
      [
        {
          type: 'click',
          pageInfo: { width: 1280, height: 720 },
          timestamp: 1,
          hashId: 'renderer-cancel-event',
        },
      ],
      {
        abortSignal: controller.signal,
        modelConfig: {
          modelName: 'gpt-4o',
          modelDescription: '',
          intent: 'default',
          slot: 'default',
        },
      },
    );
    await vi.waitFor(() => {
      expect(describeRecorderUIEvents).toHaveBeenCalledTimes(1);
    });
    const jobId = describeRecorderUIEvents.mock.calls[0][0].jobId;

    controller.abort(new Error('renderer description timed out'));

    await expect(promise).rejects.toThrow('renderer description timed out');
    expect(cancelDescribeRecorderUIEvents).toHaveBeenCalledWith(jobId);
  });
});
