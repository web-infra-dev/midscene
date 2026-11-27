import { TaskExecutor } from '@/agent/tasks';
import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import type { ServiceDump } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

const createMockUIContext = async (frame = 'fixed') => ({
  screenshot: ScreenshotItem.create(frame, Date.now()),
  shotSize: { width: 800, height: 600 },
  shrunkShotToLogicalRatio: 1,
});

const referenceImageDataUrl = 'data:image/webp;base64,dGVzdA==';

describe('numeric reads while the requested value is loading', () => {
  const model = getModelRuntime({
    modelName: 'mock-model',
    modelDescription: 'mock',
    intent: 'default',
    slot: 'default',
  });
  const pending = { Number: null, valueIsLoading: true };
  function setup(responses: unknown[], afterRead?: () => void) {
    let index = 0;
    const contextRetrieverFn = rs.fn(() =>
      createMockUIContext(`frame-${index}`),
    );
    const extract = rs.fn(async () => {
      const data = responses[index++];
      afterRead?.();
      const dump: ServiceDump = {
        type: 'extract',
        logId: 'read',
        logTime: Date.now(),
        taskInfo: { durationMs: 0 },
        userQuery: {},
        data,
      };
      return { data, dump, thought: 'observed' };
    });
    const service = { contextRetrieverFn, extract };
    const executor = new TaskExecutor({} as any, service as any, {
      getDefaultModelRuntime: () => model,
      actionSpace: [],
    });
    return { executor, extract };
  }

  it('recaptures the screen and preserves zero when the number becomes available', async () => {
    const { executor, extract } = setup([
      { valueIsLoading: true },
      { Number: 0, valueIsLoading: false },
    ]);
    rs.useFakeTimers();
    let result;
    try {
      const read = executor.createTypeQueryExecution(
        'Number',
        { demand: 'balance' },
        model,
      );
      await rs.advanceTimersByTimeAsync(2_999);
      expect(extract).toHaveBeenCalledTimes(1);
      await rs.advanceTimersByTimeAsync(1);
      result = await read;
    } finally {
      rs.useRealTimers();
    }
    expect(result.output).toBe(0);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(
      result.runner.tasks.map((task) => task.uiContext?.screenshot.base64),
    ).toEqual(['frame-0', 'frame-1']);
    expect(result.runner.tasks.map((task) => task.subType)).toEqual([
      'Number',
      'Number',
    ]);
  });

  it('reads once when a value is missing without a loading signal', async () => {
    const { executor, extract } = setup([
      { Number: null, valueIsLoading: false },
    ]);
    expect(
      (
        await executor.createTypeQueryExecution(
          'Number',
          { demand: 'balance' },
          model,
        )
      ).output,
    ).toBe(null);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('keeps a visible number even if the model also returns a loading flag', async () => {
    const { executor, extract } = setup([{ Number: 0, valueIsLoading: true }]);
    expect(
      (
        await executor.createTypeQueryExecution(
          'Number',
          { demand: 'balance' },
          model,
        )
      ).output,
    ).toBe(0);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('samples a fast model across the patience window and stops on the third pending observation', async () => {
    const { executor, extract } = setup([pending, pending, pending]);
    rs.useFakeTimers();
    try {
      const read = expect(
        executor.createTypeQueryExecution(
          'Number',
          { demand: 'balance' },
          model,
        ),
      ).rejects.toThrow(/still loading/);
      await rs.advanceTimersByTimeAsync(14_999);
      expect(extract).toHaveBeenCalledTimes(2);
      await rs.advanceTimersByTimeAsync(1);
      await read;
      expect(extract).toHaveBeenCalledTimes(3);
    } finally {
      rs.useRealTimers();
    }
  });

  it('does not poll a saved observation or a reference-image query', async () => {
    const { executor, extract } = setup([pending, pending]);
    const uiContext = await createMockUIContext();
    const fixed = await executor.createTypeQueryExecution(
      'Number',
      { demand: 'balance' },
      model,
      {},
      { uiContext },
    );
    const reference = await executor.createTypeQueryExecution(
      'Number',
      {
        demand: 'balance',
        images: [{ name: 'reference', url: referenceImageDataUrl }],
      },
      model,
    );
    expect([fixed.output, reference.output]).toEqual([null, null]);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('honors cancellation before another observation', async () => {
    const abort = new AbortController();
    const { executor, extract } = setup([pending], () =>
      abort.abort(new Error('cancelled during read')),
    );
    await expect(
      executor.createTypeQueryExecution(
        'Number',
        { demand: 'balance' },
        model,
        {},
        { abortSignal: abort.signal },
      ),
    ).rejects.toThrow();
    expect(extract).toHaveBeenCalledTimes(1);
  });
});
