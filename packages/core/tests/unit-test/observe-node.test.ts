import { afterEach, expect, rs, test } from '@rstest/core';
import { commonAgentTestRunnerNodeDefinitions } from '../../src/agent/test-runner-nodes';
const createObserveNodeDefinition = () =>
  commonAgentTestRunnerNodeDefinitions.find((node) => node.name === 'observe')!;

function fixture(pass = true) {
  const order: string[] = [];
  const controller = new AbortController();
  const observation = {
    frameCount: 4,
    startedAt: 100,
    endedAt: 900,
    aiAssert: rs.fn(async () => {
      order.push('assert');
      return { pass, thought: 'visible sequence' };
    }),
  };
  const observer = {
    bufferedFrameCount: 1,
    stop: rs.fn(async () => {
      order.push('stop');
      return observation;
    }),
    dispose: rs.fn(async () => {
      order.push('dispose');
    }),
  };
  const agent = {
    startObserving: rs.fn(async () => {
      order.push('start');
      return observer;
    }),
    aiAct: rs.fn(async () => {
      order.push('act');
    }),
    flushReport: rs.fn(async () => {
      order.push('flush');
      return '/report.html';
    }),
  };
  const run = async (
    input = { act: 'submit', assert: 'loading appeared', settleMs: 0 },
  ) =>
    createObserveNodeDefinition().execute(agent, input, {
      signal: controller.signal,
    });
  return { order, controller, observation, observer, agent, run };
}

afterEach(() => {
  rs.useRealTimers();
});

test('records a complete action window and flushes report frames before disposal', async () => {
  const f = fixture();
  await expect(f.run()).resolves.toMatchObject({
    data: { pass: true, frameCount: 4, durationMs: 800 },
  });
  expect(f.order).toEqual([
    'start',
    'act',
    'stop',
    'assert',
    'flush',
    'dispose',
  ]);
  expect(f.agent.startObserving).toHaveBeenCalledWith({ watchdogMs: 0 });
  expect(f.observation.aiAssert).toHaveBeenCalledWith(
    'loading appeared',
    undefined,
    {
      keepRawResponse: true,
      abortSignal: f.controller.signal,
    },
  );
});

test('false assertions fail the Step and retain assertion evidence', async () => {
  const f = fixture(false);
  await expect(f.run()).rejects.toMatchObject({
    code: 'NODE_EXECUTION_ERROR',
    output: { data: { pass: false, frameCount: 4 } },
  });
  expect(f.observer.dispose).toHaveBeenCalledOnce();
});

test('does not perform the action without an initial frame', async () => {
  const f = fixture();
  f.observer.bufferedFrameCount = 0;
  await expect(f.run()).rejects.toThrow('initial frame');
  expect(f.agent.aiAct).not.toHaveBeenCalled();
  expect(f.observation.aiAssert).not.toHaveBeenCalled();
  expect(f.observer.dispose).toHaveBeenCalledOnce();
});

test('cancellation during settling skips assertion and awaits cleanup', async () => {
  rs.useFakeTimers();
  const f = fixture();
  const pending = f.run({
    act: 'submit',
    assert: 'loading appeared',
    settleMs: 5000,
  });
  const rejected = expect(pending).rejects.toThrow('cancelled');
  await rs.advanceTimersByTimeAsync(100);
  f.controller.abort(new Error('cancelled'));
  await rejected;
  expect(f.observation.aiAssert).not.toHaveBeenCalled();
  expect(f.observer.dispose).toHaveBeenCalledOnce();
  expect(rs.getTimerCount()).toBe(0);
});

test('awaits disposal even when an action or report fails, preserving both failures', async () => {
  const f = fixture();
  f.agent.aiAct.mockRejectedValueOnce(new Error('action failed'));
  f.agent.flushReport.mockRejectedValueOnce(new Error('report failed'));
  await expect(f.run()).rejects.toMatchObject({
    cause: {
      errors: [
        expect.objectContaining({ message: 'action failed' }),
        expect.objectContaining({ message: 'report failed' }),
      ],
    },
  });
  expect(f.observer.dispose).toHaveBeenCalledOnce();
});

test('does not report success when cleanup fails', async () => {
  const f = fixture();
  f.observer.dispose.mockRejectedValueOnce(new Error('cleanup failed'));
  await expect(f.run()).rejects.toThrow('cleanup failed');
});

test('preserves window facts when the SDK throws before returning its assertion result', async () => {
  const f = fixture();
  f.observation.aiAssert.mockRejectedValueOnce(
    new Error('SDK assertion failed'),
  );
  await expect(f.run()).rejects.toMatchObject({
    output: { data: { frameCount: 4, durationMs: 800 } },
  });
  expect(f.agent.flushReport).toHaveBeenCalledOnce();
  expect(f.observer.dispose).toHaveBeenCalledOnce();
});

test('validates inputs and forwards structured reference prompts without rewriting', async () => {
  const node = createObserveNodeDefinition();
  expect(node.inputSchema.safeParse({ act: '', assert: 'ok' }).success).toBe(
    false,
  );
  expect(
    node.inputSchema.safeParse({ act: 'click', assert: 'ok', settleMs: -1 })
      .success,
  ).toBe(false);
  const f = fixture();
  const prompt = {
    prompt: 'Compare reference',
    images: [{ name: 'expected', url: '/reference.png' }],
  };
  await node.execute(
    f.agent,
    { act: prompt, assert: prompt },
    { signal: f.controller.signal },
  );
  expect(f.agent.aiAct).toHaveBeenCalledWith(prompt, {
    abortSignal: f.controller.signal,
  });
});

test('action failure retains stopped-window facts without an assertion verdict', async () => {
  const f = fixture();
  const failure = new Error('planning returned empty response');
  f.agent.aiAct.mockRejectedValueOnce(failure);
  const error = await f.run().catch((error) => error);
  expect(error.cause).toBe(failure);
  expect(error.output.data).toEqual({ frameCount: 4, durationMs: 800 });
  expect(f.observation.aiAssert).not.toHaveBeenCalled();
  expect(f.observer.stop).toHaveBeenCalledOnce();
});

test('cancellation during start still stops the acquired observer and retains its facts', async () => {
  const f = fixture();
  f.agent.startObserving.mockImplementationOnce(async () => {
    f.controller.abort(new Error('cancelled during start'));
    return f.observer;
  });
  const error = await f.run().catch((error) => error);
  expect(error.output.data).toEqual({ frameCount: 4, durationMs: 800 });
  expect(f.agent.aiAct).not.toHaveBeenCalled();
  expect(f.observation.aiAssert).not.toHaveBeenCalled();
  expect(f.observer.stop).toHaveBeenCalledOnce();
  expect(f.observer.dispose).toHaveBeenCalledOnce();
});

test('already cancelled nodes never start observing', async () => {
  const f = fixture();
  f.controller.abort(new Error('cancelled'));
  await expect(f.run()).rejects.toThrow('cancelled');
  expect(f.agent.startObserving).not.toHaveBeenCalled();
});

test('stop failure is retained once and still flushes and disposes', async () => {
  const f = fixture();
  const failure = new Error('stop failed');
  f.observer.stop.mockRejectedValueOnce(failure);
  await expect(f.run()).rejects.toMatchObject({ cause: failure });
  expect(f.observer.stop).toHaveBeenCalledOnce();
  expect(f.observation.aiAssert).not.toHaveBeenCalled();
  expect(f.agent.flushReport).toHaveBeenCalledOnce();
  expect(f.observer.dispose).toHaveBeenCalledOnce();
});

test.each([
  { frameCount: 0, startedAt: 100, endedAt: 900 },
  { frameCount: 1, startedAt: 900, endedAt: 100 },
  { frameCount: 1, startedAt: 100, endedAt: Number.NaN },
])(
  'rejects invalid windows without making an assertion: %j',
  async (window) => {
    const f = fixture();
    Object.assign(f.observation, window);
    await expect(f.run()).rejects.toThrow('invalid screenshot window');
    expect(f.observation.aiAssert).not.toHaveBeenCalled();
    expect(f.observer.dispose).toHaveBeenCalledOnce();
  },
);

test('waits for actual disposal before settling a failed action', async () => {
  const f = fixture();
  let release!: () => void;
  const disposal = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.observer.dispose.mockImplementationOnce(async () => {
    await disposal;
  });
  f.agent.aiAct.mockRejectedValueOnce(new Error('action failed'));
  let settled = false;
  const pending = f.run().catch((error) => {
    settled = true;
    return error;
  });
  await rs.waitFor(() => expect(f.observer.dispose).toHaveBeenCalledOnce());
  expect(settled).toBe(false);
  release();
  expect((await pending).output.data).toEqual({
    frameCount: 4,
    durationMs: 800,
  });
});
