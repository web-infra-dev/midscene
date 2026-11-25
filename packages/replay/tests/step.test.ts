import type { Agent } from '@midscene/core';
import { expect, it, rs } from '@rstest/core';
import { defineStep, runReplayStep, withReplay } from '../src';
import { followPopup } from '../src/runtime/popup';

it('removes old flow metadata and never recovers a failed run by calling done', async () => {
  expect(() => defineStep({ id: 'old', run() {} } as never)).toThrow(
    'Unknown step field',
  );
  const done = rs.fn();
  await expect(
    runReplayStep(
      {} as Agent,
      defineStep({
        run() {
          throw new Error('failed');
        },
        done,
      }),
    ),
  ).rejects.toThrow('failed');
  expect(done).not.toHaveBeenCalled();
});
it('cancels polling promptly and does not dispatch after cancellation', async () => {
  const controller = new AbortController();
  const agent = {
    evaluateJavaScript: rs.fn(async () => false),
    callActionInActionSpace: rs.fn(),
  };
  const rp = withReplay(agent as unknown as Agent, {
    signal: controller.signal,
  });
  const pending = rp.waitFor('false', { timeoutMs: 10000 });
  controller.abort(new Error('cancelled'));
  await expect(pending).rejects.toThrow('cancelled');
  await expect(
    rp.tap('button', { candidates: [{ xpath: '//button' }] }),
  ).rejects.toThrow('cancelled');
  expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
});
it('passes cancellation to Jev and reports phase time only after done', async () => {
  const controller = new AbortController();
  const judge = {
    model: 'fixture',
    detects: { pending: true, inconclusive: true },
    judge: rs.fn(async ({ abortSignal }) => {
      expect(abortSignal).toBe(controller.signal);
      return { state: 'pass' as const };
    }),
  };
  const agent = {
    interface: { screenshotBase64: async () => 'YQ==' },
    recordToReport: rs.fn(),
  };
  const events: unknown[] = [];
  expect(
    await runReplayStep(
      agent as unknown as Agent,
      {
        run: async (rp) => {
          await rp.verify('green');
          return 4;
        },
        done() {},
      },
      { judge, signal: controller.signal, onEvent: (e) => events.push(e) },
    ),
  ).toBe(4);
  expect(events.at(-1)).toMatchObject({
    type: 'phase',
    phase: 'done',
    phaseMs: { run: expect.any(Number), done: expect.any(Number) },
  });
});

it('cancels popup handoff without switching the Agent to a late page', async () => {
  const controller = new AbortController();
  let resolvePopup!: (page: unknown) => void;
  const opened = new Promise((resolve) => {
    resolvePopup = resolve;
  });
  const agent = {
    activePage: {
      opener: async () => null,
      context: () => ({ waitForEvent: () => opened }),
    },
    setActivePage: rs.fn(),
  };
  const pending = followPopup(
    agent as unknown as Agent,
    async () => {},
    5000,
    controller.signal,
  );
  controller.abort(new Error('cancel popup'));
  await expect(pending).rejects.toThrow('cancel popup');
  resolvePopup({ url: () => '/late' });
  await Promise.resolve();
  expect(agent.setActivePage).not.toHaveBeenCalled();
});
