import { channel } from 'node:diagnostics_channel';
import type { Agent } from '@midscene/core';
import { expect, it, rs } from '@rstest/core';
import {
  type TapTarget,
  type VerdictJudge,
  type VerdictState,
  checkReplayHost,
  withReplay,
} from '../src/experimental';

function fixture(states: VerdictState[] = ['pass']) {
  const point = { identity: 'a', tag: 'button', x: 32, y: 16 };
  const agent = {
    evaluateJavaScript: rs.fn(async (_expression: string) => ({ point })),
    getUIContext: rs.fn(async () => ({ shrunkShotToLogicalRatio: 1.5 })),
    callActionInActionSpace: rs.fn(async () => undefined),
    recordToReport: rs.fn(async () => undefined),
    interface: { screenshotBase64: rs.fn(async () => 'YQ==') },
  };
  const judge: VerdictJudge = {
    model: 'fixture',
    detects: { pending: true, inconclusive: true },
    judge: rs.fn(async () => ({ state: states.shift()! })),
  };
  return {
    agent,
    judge,
    replay: withReplay(agent as unknown as Agent, { judge }),
  };
}
const target = { candidates: [{ xpath: '//button' }] } as const;

it('publishes named wait timings on success and timeout without adding screenshots', async () => {
  const { agent, replay } = fixture();
  const events: unknown[] = [];
  const stream = channel('midscene.replay');
  const collect = (message: unknown) => {
    const record = message as { agent: unknown; event: unknown };
    if (record.agent === agent) events.push(record.event);
  };
  stream.subscribe(collect);
  try {
    agent.evaluateJavaScript.mockResolvedValueOnce(true as never);
    await replay.waitFor(() => true, { title: 'Wood receipt' });
    agent.evaluateJavaScript.mockResolvedValueOnce(false as never);
    await expect(
      replay.waitFor(() => false, { title: 'Save complete' }),
    ).rejects.toMatchObject({
      code: 'WAIT_TIMEOUT',
      details: { condition: 'Save complete' },
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'wait',
        title: 'Wood receipt',
        status: 'passed',
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({
        type: 'wait',
        title: 'Save complete',
        status: 'failed',
        durationMs: expect.any(Number),
      }),
    ]);
    expect(agent.interface.screenshotBase64).not.toHaveBeenCalled();
  } finally {
    stream.unsubscribe(collect);
  }
});

it('rejects a smaller viewport during host preflight', async () => {
  const { agent } = fixture();
  agent.evaluateJavaScript.mockResolvedValue({
    width: 640,
    height: 480,
  } as never);
  await expect(
    checkReplayHost(agent as unknown as Agent, {
      minViewport: { width: 800, height: 400 },
    }),
  ).rejects.toMatchObject({
    code: 'HOST_UNSUPPORTED',
    details: { actual: { width: 640, height: 480 } },
  });
});
function attachPopup(
  agent: ReturnType<typeof fixture>['agent'],
  afterClick: () => void,
) {
  const source: Record<string, unknown> = {};
  const popup = { opener: async () => source };
  let clicked!: () => void;
  const click = new Promise<void>((resolve) => {
    clicked = resolve;
  });
  const waitForEvent = rs.fn(
    async (
      _event: string,
      { predicate }: { predicate: (page: unknown) => Promise<boolean> },
    ) => {
      await click;
      if (!(await predicate({ opener: async () => null })))
        expect(await predicate(popup)).toBe(true);
      return popup;
    },
  );
  Object.assign(source, {
    context: () => ({ waitForEvent }),
    opener: async () => null,
  });
  const setActivePage = rs.fn(async () => undefined);
  Object.assign(agent, { activePage: source, setActivePage });
  agent.callActionInActionSpace.mockImplementation(async () => {
    expect(waitForEvent).toHaveBeenCalledTimes(1);
    clicked();
    afterClick();
  });
  return { waitForEvent, setActivePage, popup };
}

it('starts popup waiting after target readiness and before the only dispatch', async () => {
  const { agent, replay } = fixture();
  const { waitForEvent, setActivePage, popup } = attachPopup(agent, () =>
    agent.evaluateJavaScript.mockResolvedValue(true as never),
  );
  agent.evaluateJavaScript.mockResolvedValueOnce({
    error: { code: 'TARGET_MISSING', message: 'TARGET_MISSING' },
  } as never);
  await replay.tap('popup', {
    candidates: [...target.candidates],
    timeoutMs: 500,
    opensPage: { url: 'https://example.test/', timeoutMs: 10 },
  });
  expect(waitForEvent).toHaveBeenCalledTimes(1);
  expect(setActivePage).toHaveBeenCalledWith(popup);
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(1);
});

it('rejects unsupported popup hosts before dispatch and verifies the destination after one click', async () => {
  const { agent, replay } = fixture();
  const popupTarget: TapTarget = {
    candidates: [...target.candidates],
    opensPage: { url: 'https://example.test/', timeoutMs: 0 },
  };
  await expect(replay.tap('popup', popupTarget)).rejects.toThrow(
    'POPUP_UNSUPPORTED',
  );
  expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
  const { waitForEvent } = attachPopup(agent, () =>
    agent.evaluateJavaScript.mockResolvedValue(false as never),
  );
  await expect(replay.tap('wrong destination', popupTarget)).rejects.toThrow(
    'WAIT_TIMEOUT',
  );
  expect(waitForEvent).toHaveBeenCalledTimes(1);
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(1);
});

it('checks the popup postcondition after the destination becomes ready', async () => {
  const { agent, replay } = fixture();
  let checks = 0;
  attachPopup(agent, () => {
    agent.evaluateJavaScript.mockImplementation(
      async () => (++checks > 1) as never,
    );
  });
  const postcondition = rs.fn(() => expect(checks).toBeGreaterThanOrEqual(2));
  await replay.tap('popup', {
    candidates: [...target.candidates],
    opensPage: { url: 'https://example.test/', timeoutMs: 1000 },
    postcondition,
  });
  expect(postcondition).toHaveBeenCalledTimes(1);
});

it('reports only the action failure when a popup target is missing', async () => {
  const { agent, replay } = fixture();
  const { waitForEvent } = attachPopup(agent, () => {});
  agent.evaluateJavaScript.mockResolvedValue({
    error: { code: 'TARGET_MISSING', message: 'TARGET_MISSING' },
  } as never);
  await expect(
    replay.tap('missing popup source', {
      candidates: [...target.candidates],
      timeoutMs: 0,
      opensPage: { url: 'https://example.test/' },
    }),
  ).rejects.toMatchObject({ code: 'TARGET_MISSING' });
  expect(waitForEvent).not.toHaveBeenCalled();
  expect(agent.recordToReport).toHaveBeenCalledTimes(1);
});

it('rechecks a replaced target before dispatching one measured pixel per call', async () => {
  const { agent, replay } = fixture();
  await replay.tap('button', {
    candidates: [...target.candidates],
    timeoutMs: 500,
  });
  expect(agent.callActionInActionSpace).toHaveBeenCalledWith(
    'Tap',
    {
      locate: {
        prompt: 'button',
        cacheable: false,
        locatedPixelResult: { center: [48, 24] },
      },
    },
    undefined,
    { skipDefaultWait: true, deferModelResolution: true },
  );
  const stable = {
    point: { identity: 'replacement', tag: 'button', x: 80, y: 40 },
  };
  agent.evaluateJavaScript
    .mockResolvedValueOnce({
      point: { identity: 'old', tag: 'button', x: 20, y: 10 },
    })
    .mockResolvedValue(stable);
  await replay.tap('button', {
    candidates: [...target.candidates],
    timeoutMs: 500,
  });
  expect(agent.callActionInActionSpace).toHaveBeenLastCalledWith(
    'Tap',
    expect.objectContaining({
      locate: expect.objectContaining({
        locatedPixelResult: { center: [120, 60] },
      }),
    }),
    undefined,
    { skipDefaultWait: true, deferModelResolution: true },
  );
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(2);
});
it('reports a dispatch failure without retrying an action', async () => {
  const { agent, replay } = fixture();
  agent.callActionInActionSpace.mockRejectedValueOnce(new Error('device'));
  await expect(
    replay.tap('button', { candidates: [...target.candidates] }),
  ).rejects.toMatchObject({ code: 'DISPATCH_FAILED', dispatch: 'unknown' });
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(1);
});
it('takes a new frame only after pending', async () => {
  const { judge, replay, agent } = fixture(['pending', 'pass']);
  await expect(
    replay.verify('ready', { settleTimeoutMs: 2000 }),
  ).resolves.toMatchObject({ state: 'pass' });
  expect(judge.judge).toHaveBeenCalledTimes(2);
  expect(agent.interface.screenshotBase64).toHaveBeenCalledTimes(2);
  expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
});
for (const state of ['fail', 'pending', 'inconclusive'] as const)
  it(`exposes the ${state} verdict`, async () => {
    const { replay } = fixture([state]);
    await expect(replay.verify('ready')).rejects.toMatchObject({
      code: `VERIFY_${state.toUpperCase()}`,
      verdict: { state },
    });
  });

it('waits by default but supports a zero readiness budget', async () => {
  const { agent, replay } = fixture();
  agent.evaluateJavaScript.mockResolvedValueOnce({
    error: { code: 'TARGET_MISSING', message: 'TARGET_MISSING' },
  } as never);
  await expect(
    replay.tap('button', { candidates: [...target.candidates], timeoutMs: 0 }),
  ).rejects.toMatchObject({ code: 'TARGET_MISSING' });
  expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
  agent.evaluateJavaScript.mockResolvedValueOnce({
    error: { code: 'TARGET_MISSING', message: 'TARGET_MISSING' },
  } as never);
  await replay.tap('button', {
    candidates: [...target.candidates],
    timeoutMs: 500,
  });
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(1);
});
it('does not wait or dispatch for an ambiguous target even with a budget', async () => {
  const { agent, replay } = fixture();
  agent.evaluateJavaScript.mockResolvedValueOnce({
    error: { code: 'TARGET_AMBIGUOUS', message: 'TARGET_AMBIGUOUS' },
  } as never);
  await expect(
    replay.tap('button', {
      candidates: [...target.candidates],
      timeoutMs: 5000,
    }),
  ).rejects.toMatchObject({ code: 'TARGET_AMBIGUOUS' });
  expect(agent.evaluateJavaScript).toHaveBeenCalledTimes(1);
  expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
});

it('retries navigation context replacement only before dispatch with an explicit budget', async () => {
  const { agent, replay } = fixture();
  const error = new Error(
    'Execution context was destroyed, most likely because of a navigation.',
  );
  agent.evaluateJavaScript.mockRejectedValueOnce(error);
  await expect(
    replay.tap('button', { candidates: [...target.candidates], timeoutMs: 0 }),
  ).rejects.toThrow('Execution context');
  expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
  agent.evaluateJavaScript.mockRejectedValueOnce(error);
  await replay.tap('button', {
    candidates: [...target.candidates],
    timeoutMs: 500,
  });
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(1);
  agent.callActionInActionSpace.mockRejectedValueOnce(error);
  await expect(
    replay.tap('button', {
      candidates: [...target.candidates],
      timeoutMs: 500,
    }),
  ).rejects.toMatchObject({ code: 'DISPATCH_FAILED' });
  expect(agent.callActionInActionSpace).toHaveBeenCalledTimes(2);
});

it('condition waits tolerate navigation within budget and surface syntax errors immediately', async () => {
  const { agent, replay } = fixture();
  agent.evaluateJavaScript.mockRejectedValueOnce(
    new Error('Execution context was destroyed'),
  );
  agent.evaluateJavaScript.mockResolvedValueOnce(true as never);
  await replay.waitFor('document.readyState === "complete"', {
    timeoutMs: 500,
  });
  agent.evaluateJavaScript.mockRejectedValueOnce(
    new SyntaxError('Unexpected token'),
  );
  await expect(replay.waitFor('(', { timeoutMs: 500 })).rejects.toThrow(
    'Unexpected token',
  );
  expect(agent.callActionInActionSpace).not.toHaveBeenCalled();
});

it('uses bounded default readiness, caches a stable scale and avoids a duplicate action screenshot', async () => {
  const { agent, replay } = fixture();
  agent.evaluateJavaScript.mockResolvedValueOnce({
    error: { code: 'TARGET_MISSING', message: 'TARGET_MISSING' },
  } as never);
  await replay.tap('first', { candidates: [...target.candidates] });
  await replay.input('second', {
    candidates: [...target.candidates],
    value: 'abc',
    inputStrategy: 'bulk',
  });
  expect(agent.getUIContext).toHaveBeenCalledTimes(1);
  expect(agent.recordToReport).not.toHaveBeenCalled();
  expect(agent.callActionInActionSpace).toHaveBeenLastCalledWith(
    'Input',
    expect.objectContaining({ value: 'abc', inputStrategy: 'bulk' }),
    undefined,
    { skipDefaultWait: true, deferModelResolution: true },
  );
  agent.getUIContext.mockResolvedValue({ shrunkShotToLogicalRatio: 2 });
  agent.evaluateJavaScript.mockResolvedValue({
    point: { identity: 'new-page', tag: 'button', x: 20, y: 10 },
    geometry: [2, 800, 600, 2, 1],
  } as never);
  await replay.tap('after page/geometry change', {
    candidates: [...target.candidates],
  });
  expect(agent.getUIContext).toHaveBeenCalledTimes(2);
  expect(agent.callActionInActionSpace).toHaveBeenLastCalledWith(
    'Tap',
    expect.objectContaining({
      locate: expect.objectContaining({
        locatedPixelResult: { center: [40, 20] },
      }),
    }),
    undefined,
    { skipDefaultWait: true, deferModelResolution: true },
  );
});

it('records checkpoint values, captures failure screenshots and surfaces evidence errors without masking assertion failures', async () => {
  const { agent, replay } = fixture();
  agent.evaluateJavaScript.mockResolvedValueOnce({ count: 2 } as never);
  await expect(
    replay.checkpoint('cart count', () => ({ count: 2 }), {
      expect: { count: 2 },
    }),
  ).resolves.toEqual({ count: 2 });
  expect(agent.interface.screenshotBase64).not.toHaveBeenCalled();

  agent.evaluateJavaScript.mockResolvedValueOnce({ count: 1 } as never);
  await expect(
    replay.checkpoint('cart count', () => ({ count: 1 }), {
      expect: { count: 2 },
    }),
  ).rejects.toThrow('cart count');
  expect(agent.interface.screenshotBase64).toHaveBeenCalledTimes(1);
  expect(agent.recordToReport).toHaveBeenCalledWith(
    'Replay · checkpoint',
    expect.objectContaining({
      content: expect.stringContaining('"status":"failed"'),
      screenshots: [{ base64: 'YQ==' }],
    }),
  );

  agent.evaluateJavaScript.mockResolvedValueOnce({ count: 0 } as never);
  agent.interface.screenshotBase64.mockRejectedValueOnce(
    new Error('screenshot failed'),
  );
  await expect(
    replay.checkpoint('cart count', () => ({ count: 0 }), {
      expect: { count: 2 },
    }),
  ).rejects.toThrow('cart count');
});

it('matches exact and structured URLs in waitForUrl and rejects malformed targets', async () => {
  const { agent, replay } = fixture();
  agent.evaluateJavaScript.mockImplementation(
    async (expression: string) =>
      new Function('location', `return ${expression}`)({
        href: 'https://example.test/search?q=midscene&page=2#results',
      }) as never,
  );
  await replay.waitForUrl(
    'https://example.test/search?q=midscene&page=2#results',
  );
  await replay.waitForUrl({
    origin: 'https://example.test',
    pathname: '/search',
    search: { q: 'midscene' },
    hash: '#results',
  });
  await expect(
    replay.waitForUrl({ pathname: '/other' }, { timeoutMs: 0 }),
  ).rejects.toMatchObject({ code: 'WAIT_TIMEOUT' });
  await expect(
    replay.waitForUrl('https://user:pass@example.test/'),
  ).rejects.toMatchObject({ code: 'INVALID_REPLAY_URL' });
});
