import type { Agent } from '@midscene/core';
import { expect, it, rs } from '@rstest/core';
import { ReplayStepError, defineReplay, defineStep } from '../src/experimental';

function fakeAgent() {
  const point = { identity: 'a', tag: 'button', x: 10, y: 10 };
  return {
    evaluateJavaScript: rs.fn(async () => ({ point })),
    getUIContext: rs.fn(async () => ({ shrunkShotToLogicalRatio: 1 })),
    callActionInActionSpace: rs.fn(async () => undefined),
    aiTap: rs.fn(async () => undefined),
    recordToReport: rs.fn(async () => undefined),
    interface: { screenshotBase64: rs.fn(async () => 'YQ==') },
  } as unknown as Agent & {
    callActionInActionSpace: ReturnType<typeof rs.fn>;
  };
}
const button = { candidates: [{ xpath: '//button' }] as [{ xpath: string }] };
const meta = { platform: 'web' as const };

it('does not repeat select when the browser loses the dispatch response', async () => {
  const agent = fakeAgent();
  const point = { identity: 'a', tag: 'select', x: 10, y: 10 };
  const evaluate = rs
    .spyOn(agent, 'evaluateJavaScript')
    .mockResolvedValueOnce({ point })
    .mockRejectedValueOnce(new Error('Execution context was destroyed'));
  const flow = defineReplay({
    meta,
    steps: [
      defineStep({
        id: 'sort',
        title: 'Sort',
        run: (rp) =>
          rp.select('Sort by price', {
            candidates: [{ xpath: '//select' }],
            option: { value: 'price' },
          }),
      }),
    ],
  });
  await expect(flow.run(agent)).rejects.toMatchObject({
    step: {
      attempts: [expect.objectContaining({ status: 'failed', dispatched: 1 })],
    },
  });
  expect(evaluate).toHaveBeenCalledTimes(2);
});

it('retries select readiness across a navigation race without counting a dispatch', async () => {
  const agent = fakeAgent();
  const point = { identity: 'a', tag: 'select', x: 10, y: 10 };
  const evaluate = rs
    .spyOn(agent, 'evaluateJavaScript')
    .mockRejectedValueOnce(new Error('Execution context was destroyed'))
    .mockResolvedValueOnce({ point })
    .mockResolvedValueOnce({ point });
  const flow = defineReplay({
    meta,
    steps: [
      defineStep({
        id: 'sort',
        title: 'Sort',
        run: (rp) =>
          rp.select('Sort by price', {
            candidates: [{ xpath: '//select' }],
            option: { value: 'price' },
            timeoutMs: 1000,
          }),
      }),
    ],
  });
  const outcome = await flow.run(agent);
  expect(outcome.steps[0].attempts).toEqual([
    expect.objectContaining({ status: 'passed', dispatched: 1 }),
  ]);
  expect(evaluate).toHaveBeenCalledTimes(3);
  expect(evaluate.mock.calls[0]?.[0]).toContain('"select-ready"');
  expect(evaluate.mock.calls[1]?.[0]).toContain('"select-ready"');
  expect(evaluate.mock.calls[2]?.[0]).toContain('"select"');
});

it('retries a step that failed before dispatch and passes results between steps', async () => {
  const agent = fakeAgent();
  let tries = 0;
  const flow = defineReplay({
    meta,
    steps: [
      defineStep({
        id: 'open',
        title: 'Open',
        run: async (rp) => {
          if (++tries === 1) throw new Error('not ready');
          await rp.tap('button', button);
          return 'opened';
        },
        done: (_rp, ctx) => expect(ctx.results.open).toBe('opened'),
      }),
      defineStep({
        id: 'use',
        title: 'Use',
        run: (_rp, ctx) => {
          expect(ctx.results.open).toBe('opened');
          expect(ctx.step).toMatchObject({ number: 2, id: 'use', attempt: 1 });
        },
      }),
    ],
  });
  const outcome = await flow.run(agent);
  expect(outcome.status).toBe('passed');
  expect(outcome.steps[0].attempts.map((a) => a.status)).toEqual([
    'failed',
    'passed',
  ]);
  expect(outcome.steps[0].attempts[0]).toMatchObject({
    phase: 'run',
    dispatched: 0,
  });
  expect(outcome.steps[0].attempts[0].phaseMs).toEqual({
    run: expect.any(Number),
  });
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(1);
});

it('never repeats a dispatched step unless it is idempotent, and stops the flow there', async () => {
  const agent = fakeAgent();
  const failing = (retry: 'before-dispatch' | 'idempotent') =>
    defineReplay({
      meta,
      steps: [
        defineStep({
          id: 'submit',
          title: 'Submit',
          retry,
          run: async (rp) => {
            await rp.tap('submit', button);
            throw new Error('result missing');
          },
        }),
        defineStep({ id: 'next', title: 'Next', run: () => undefined }),
      ],
    });
  const error = await failing('before-dispatch')
    .run(agent)
    .catch((e) => e);
  expect(error).toBeInstanceOf(ReplayStepError);
  expect(error.step).toMatchObject({ id: 'submit', status: 'failed' });
  expect(error.outcome).toMatchObject({
    status: 'failed',
    failedStep: 'submit',
  });
  expect(error.outcome.steps[1].status).toBe('not-run');
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(1);

  await expect(failing('idempotent').run(agent)).rejects.toThrow(
    'REPLAY_STEP_FAILED',
  );
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(3);
});

it.each([undefined, null, false, 0, ''] as const)(
  'fails a required step when the thrown value is %j',
  async (cause) => {
    const next = rs.fn();
    const flow = defineReplay({
      meta,
      steps: [
        defineStep({
          id: 'broken',
          title: 'Broken',
          retry: 'never',
          run() {
            throw cause;
          },
        }),
        defineStep({ id: 'next', title: 'Next', run: next }),
      ],
    });
    await expect(flow.run(fakeAgent())).rejects.toMatchObject({
      code: 'REPLAY_STEP_FAILED',
      cause,
      outcome: {
        status: 'failed',
        failedStep: 'broken',
        steps: [
          { status: 'failed', attempts: [{ status: 'failed' }] },
          { status: 'not-run' },
        ],
      },
    });
    expect(next).not.toHaveBeenCalled();
  },
);

it('keeps native Agent access in ready as a retry guard without making run recoverable', async () => {
  const done = rs.fn();
  const flow = defineReplay({
    meta,
    steps: [
      defineStep({
        id: 'submit',
        title: 'Submit',
        ready(_rp, ctx) {
          void ctx.agent;
        },
        run() {
          throw new Error('before dispatch');
        },
        done,
      }),
    ],
  });
  const error = await flow.run(fakeAgent()).catch((error) => error);
  expect(error).toBeInstanceOf(ReplayStepError);
  expect(error.step.attempts).toEqual([
    expect.objectContaining({
      status: 'failed',
      phase: 'run',
      dispatched: 0,
      dispatchUnknown: true,
      phaseMs: { ready: expect.any(Number), run: expect.any(Number) },
    }),
  ]);
  expect(done).not.toHaveBeenCalled();
});

it('does not retry after an untracked native Agent action whose result cannot be verified', async () => {
  const agent = fakeAgent();
  const done = rs.fn(() => {
    throw new Error('expected result is missing');
  });
  const flow = defineReplay({
    meta,
    steps: [
      defineStep({
        id: 'submit',
        title: 'Submit',
        async run(_rp, ctx) {
          await ctx.agent.aiTap('submit');
          throw new Error('result missing');
        },
        done,
      }),
    ],
  });
  const error = await flow.run(agent).catch((error) => error);
  expect(error).toBeInstanceOf(ReplayStepError);
  expect(error.step.attempts).toEqual([
    expect.objectContaining({
      status: 'failed',
      dispatched: 0,
      dispatchUnknown: true,
      error: expect.objectContaining({ message: 'Error: result missing' }),
      recoveryError: expect.objectContaining({
        message: 'Error: expected result is missing',
        stage: 'done',
      }),
    }),
  ]);
  expect(agent.aiTap).toHaveBeenCalledTimes(1);
  expect(done).toHaveBeenCalledTimes(1);
});

it('recovers an untracked Agent action by checking its result without dispatching again', async () => {
  const agent = fakeAgent();
  let submitted = false;
  agent.aiTap = rs.fn(async () => {
    submitted = true;
    throw new Error('late confirmation');
  });
  const flow = defineReplay({
    meta,
    steps: [
      defineStep({
        id: 'submit',
        title: 'Submit',
        run: async (_rp, ctx) => ctx.agent.aiTap('submit'),
        done: () => expect(submitted).toBe(true),
      }),
      defineStep({
        id: 'next',
        title: 'Next',
        run: (_rp, ctx) => expect(ctx.results).not.toHaveProperty('submit'),
      }),
    ],
  });
  const outcome = await flow.run(agent);
  expect(outcome.steps[0].attempts).toEqual([
    expect.objectContaining({
      status: 'recovered',
      phase: 'run',
      dispatched: 0,
      dispatchUnknown: true,
      phaseMs: { run: expect.any(Number), done: expect.any(Number) },
      error: expect.objectContaining({ message: 'Error: late confirmation' }),
    }),
  ]);
  expect(agent.aiTap).toHaveBeenCalledTimes(1);
});

it('accepts a recovered step and withholds the return value of a failed optional step', async () => {
  const agent = fakeAgent();
  const flow = defineReplay({
    meta,
    steps: [
      defineStep({
        id: 'save',
        title: 'Save',
        run: async (rp) => {
          await rp.tap('save', button);
          throw new Error('late confirmation');
        },
        done: () => undefined,
      }),
      defineStep({
        id: 'banner',
        title: 'Dismiss banner',
        optional: true,
        retry: 'never',
        run: () => 'unverified',
        done: (_rp, ctx) => {
          expect(ctx.results.banner).toBe('unverified');
          throw new Error('could not verify banner state');
        },
      }),
      defineStep({
        id: 'last',
        title: 'Last',
        run: (_rp, ctx) => {
          expect(ctx.results).not.toHaveProperty('save');
          expect(ctx.results).not.toHaveProperty('banner');
        },
      }),
    ],
  });
  const outcome = await flow.run(agent);
  expect(outcome.status).toBe('passed');
  expect(outcome.steps.map((step) => step.status)).toEqual([
    'passed',
    'failed',
    'passed',
  ]);
  expect(outcome.steps[0].attempts[0]).toMatchObject({
    status: 'recovered',
    dispatched: 1,
    phase: 'run',
    phaseMs: { run: expect.any(Number), done: expect.any(Number) },
  });
});

it('runs a step range, requiring an entry check to start mid-flow', async () => {
  const agent = fakeAgent();
  const calls: string[] = [];
  const step = (id: string, ready?: boolean) =>
    defineStep({
      id,
      title: id,
      ...(ready ? { ready: () => void calls.push(`${id}:ready`) } : {}),
      run: () => void calls.push(id),
    });
  const flow = defineReplay({
    meta,
    steps: [step('a'), step('b'), step('c', true), step('d')],
  });
  await expect(flow.run(agent, { from: 'b' })).rejects.toThrow(
    'STEP_READY_REQUIRED',
  );
  const outcome = await flow.run(agent, { from: 3, until: 'c' });
  expect(calls).toEqual(['c:ready', 'c']);
  expect(outcome.steps.map((s) => s.status)).toEqual([
    'skipped',
    'skipped',
    'passed',
    'not-run',
  ]);
  expect(outcome.steps[2].attempts[0].phaseMs).toEqual({
    ready: expect.any(Number),
    run: expect.any(Number),
  });
  await expect(flow.run(agent, { until: 'missing' })).rejects.toThrow(
    'UNKNOWN_REPLAY_STEP',
  );
});

it.each(['ready', 'done'] as const)(
  'records timing when %s throws, omitting callbacks that never ran',
  async (phase) => {
    const flow = defineReplay({
      meta,
      steps: [
        defineStep({
          id: 'check',
          title: 'Check',
          retry: 'never',
          ready: () => undefined,
          run: () => undefined,
          done: () => undefined,
          [phase]: () => {
            throw new Error('check failed');
          },
        }),
      ],
    });
    await expect(flow.run(fakeAgent())).rejects.toMatchObject({
      step: {
        attempts: [
          expect.objectContaining({
            status: 'failed',
            phase,
            phaseMs:
              phase === 'ready'
                ? { ready: expect.any(Number) }
                : {
                    ready: expect.any(Number),
                    run: expect.any(Number),
                    done: expect.any(Number),
                  },
          }),
        ],
      },
    });
  },
);

it('validates step identity and flow shape before running', () => {
  expect(() =>
    defineStep({ id: 'Bad Id', title: 'x', run: () => undefined }),
  ).toThrow('INVALID_REPLAY_STEP');
  expect(() =>
    defineStep({
      id: 'x',
      title: 'x',
      retry: 'never',
      maxAttempts: 2,
      run: () => undefined,
    }),
  ).toThrow('INVALID_REPLAY_STEP');
  const same = defineStep({ id: 'x', title: 'x', run: () => undefined });
  expect(() => defineReplay({ meta, steps: [same, same] })).toThrow(
    'duplicate step id',
  );
  expect(() => defineReplay({ meta, steps: [] })).toThrow(
    'INVALID_REPLAY_FLOW',
  );
});
