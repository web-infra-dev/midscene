import * as planningActual from '@/ai-model/workflows/planning' with {
  rstest: 'importActual',
};
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@/ai-model/workflows/planning', () => ({
  ...planningActual,
  standardPlan: rs.fn(),
}));
rs.mock('@/agent/utils', { spy: true });

import { Agent, type AgentOpt, type PlanningCache } from '@/agent';
import { commonContextParser } from '@/agent/utils';
import { standardPlan } from '@/ai-model/workflows/planning';
import { defineActionTap } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { DeviceAction } from '@/types';
import { uuid } from '@midscene/shared/utils';

const screenshot =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const uiContext = {
  screenshot: ScreenshotItem.create(screenshot, Date.now()),
  shotSize: { width: 100, height: 100 },
  shrunkShotToLogicalRatio: 1,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(options: AgentOpt = {}, interfaceType = 'android') {
  const call = rs.fn(async () => 'saved');
  const actions: DeviceAction[] = [
    { name: 'Submit', interfaceAlias: 'submit', delayBeforeRunner: 0, call },
    {
      ...defineActionTap(async () => {
        await call();
      }),
      delayBeforeRunner: 0,
    },
  ];
  const device = {
    interfaceType,
    actionSpace: () => actions,
    rectMatchesCacheFeature: rs.fn(async () => ({
      left: 10,
      top: 20,
      width: 10,
      height: 10,
    })),
    beforeInvokeAction: rs.fn(async () => {}),
    afterInvokeAction: rs.fn(async () => {}),
    openFrameSource: rs.fn(),
    screenshotBase64: rs.fn(async () => screenshot),
    evaluateJavaScript: rs.fn(async () => 'value'),
    destroy: rs.fn(async () => {}),
  };
  const agent = new Agent(device as any, {
    modelConfig: {
      MIDSCENE_MODEL_NAME: 'qwen2.5-vl-max',
      MIDSCENE_MODEL_FAMILY: 'qwen2.5-vl',
      MIDSCENE_MODEL_API_KEY: 'test-key',
      MIDSCENE_MODEL_BASE_URL: 'https://api.sample.com/v1',
    },
    generateReport: false,
    autoPrintReportMsg: false,
    waitAfterAction: 0,
    ...options,
  });
  const extract = rs.spyOn(agent.service, 'extract').mockResolvedValue({
    data: { result: true, StatementIsTruthy: true },
    thought: 'ready',
    dump: { taskInfo: {} },
  } as any);
  return { agent, device, call, extract };
}

const yaml =
  'tasks:\n  - name: submit twice\n    flow:\n      - submit: {}\n      - submit: {}\n';
function seedPlan(agent: Agent) {
  const state = agent.taskCache as unknown as {
    cache: { caches: PlanningCache[] };
    cacheOriginalLength: number;
  };
  state.cache.caches.push({
    type: 'plan',
    prompt: 'submit twice',
    yamlWorkflow: yaml,
  });
  state.cacheOriginalLength = 1;
}

describe('Agent initial page readiness', () => {
  beforeEach(() => {
    rs.mocked(commonContextParser).mockResolvedValue(uiContext);
  });
  afterEach(() => {
    rs.restoreAllMocks();
    rs.clearAllMocks();
    rs.useRealTimers();
  });

  it.each(['playwright', 'android', 'ios', 'harmony', 'computer'])(
    'waits before the first snapshot and aiTap on %s, only once',
    async (type) => {
      const started = deferred();
      const ready = deferred();
      const handler = rs.fn(async () => {
        started.resolve();
        await ready.promise;
      });
      const { agent, device, call } = setup(
        { waitForInitialPageReady: { handler } },
        type,
      );
      expect(handler).not.toHaveBeenCalled();
      const pending = agent.aiTap('submit', { xpath: '//button' });
      await Promise.race([started.promise, pending]);
      expect(commonContextParser).not.toHaveBeenCalled();
      expect(device.beforeInvokeAction).not.toHaveBeenCalled();
      expect(call).not.toHaveBeenCalled();
      ready.resolve();
      await pending;
      await agent.aiTap('submit again', { xpath: '//button' });
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
      expect(call).toHaveBeenCalledTimes(2);
      expect(device.afterInvokeAction).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['aiQuery', 'aiAssert', 'aiWaitFor'] as const)(
    'waits when %s is the first call',
    async (method) => {
      const started = deferred();
      const ready = deferred();
      const handler = rs.fn(async () => {
        started.resolve();
        await ready.promise;
      });
      const { agent, extract } = setup({
        waitForInitialPageReady: { handler },
      });
      const pending = agent[method]('page is ready');
      await Promise.race([started.promise, pending]);
      expect(extract).not.toHaveBeenCalled();
      expect(commonContextParser).not.toHaveBeenCalled();
      ready.resolve();
      await pending;
      await agent.aiAssert('still ready');
      expect(handler).toHaveBeenCalledOnce();
      expect(extract).toHaveBeenCalledTimes(2);
    },
  );

  it('shares initialization between concurrent snapshots, freezing, and later calls', async () => {
    const started = deferred();
    const ready = deferred();
    const handler = rs.fn(async () => {
      started.resolve();
      await ready.promise;
    });
    const { agent } = setup({ waitForInitialPageReady: { handler } });
    const first = agent.getUIContext();
    const second = agent.freezePageContext();
    await started.promise;
    expect(commonContextParser).not.toHaveBeenCalled();
    ready.resolve();
    await Promise.all([first, second]);
    await agent.unfreezePageContext();
    await agent.getUIContext();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('has independent readiness for each Agent', async () => {
    const handler = rs.fn(async () => {});
    const first = setup({ waitForInitialPageReady: { handler } }).agent;
    const second = setup({ waitForInitialPageReady: { handler } }).agent;
    await Promise.all([first.getUIContext(), second.getUIContext()]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('runs once before a multi-action aiAct and preserves post-action delays', async () => {
    rs.useFakeTimers();
    const actionStarted = deferred();
    const handler = rs.fn(async () => {});
    const { agent, call, device } = setup({
      waitAfterAction: undefined,
      waitForInitialPageReady: { handler },
    });
    call.mockImplementation(async () => {
      actionStarted.resolve();
      return 'saved';
    });
    rs.mocked(standardPlan).mockResolvedValue({
      actions: [
        { type: 'Submit', param: {}, thought: '' },
        { type: 'Submit', param: {}, thought: '' },
      ],
      yamlFlow: [],
      shouldContinuePlanning: false,
      log: '',
      rawResponse: '',
    });
    const pending = agent.aiAct('submit twice');
    await Promise.race([actionStarted.promise, pending]);
    expect(handler).toHaveBeenCalledOnce();
    await rs.advanceTimersByTimeAsync(299);
    expect(device.afterInvokeAction).not.toHaveBeenCalled();
    await rs.advanceTimersByTimeAsync(301);
    await pending;
    expect(handler).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledTimes(2);
    expect(device.afterInvokeAction).toHaveBeenCalledTimes(2);
  });

  it('runs once before replaying cached YAML', async () => {
    const handler = rs.fn(async () => {});
    const { agent, call } = setup({
      cache: { id: uuid() },
      waitForInitialPageReady: { handler },
    });
    seedPlan(agent);
    await agent.aiAct('submit twice');
    expect(handler).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledTimes(2);
    expect(standardPlan).not.toHaveBeenCalled();
  });

  it('retains failure before cache replay, later actions, and query fallbacks', async () => {
    const handler = rs.fn(async () => {
      throw new Error('bootstrap failed');
    });
    const { agent, call, extract, device } = setup({
      cache: { id: uuid() },
      waitForInitialPageReady: { handler },
    });
    seedPlan(agent);
    await expect(agent.aiAct('submit twice')).rejects.toThrow(
      'bootstrap failed',
    );
    await expect(agent.runYaml(yaml)).rejects.toThrow('bootstrap failed');
    await expect(
      agent.aiAssert('ready', undefined, { keepRawResponse: true }),
    ).rejects.toThrow('bootstrap failed');
    await expect(agent.aiWaitFor('ready')).rejects.toThrow('bootstrap failed');
    await expect(agent.aiLocate('submit', { uiContext })).rejects.toThrow(
      'bootstrap failed',
    );
    await expect(agent.startObserving()).rejects.toThrow('bootstrap failed');
    expect(handler).toHaveBeenCalledOnce();
    expect(commonContextParser).not.toHaveBeenCalled();
    expect(standardPlan).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(device.openFrameSource).not.toHaveBeenCalled();
    expect(device.screenshotBase64).not.toHaveBeenCalled();
  });

  it('times out before executing an action and does not retry on later calls', async () => {
    rs.useFakeTimers();
    const started = deferred();
    let signal!: AbortSignal;
    const handler = rs.fn(async (ctx) => {
      signal = ctx.signal;
      started.resolve();
      await new Promise(() => {});
    });
    const { agent, call } = setup({
      waitForInitialPageReady: { handler, timeoutMs: 25 },
    });
    const pending = agent.callActionInActionSpace('Submit');
    const assertion = expect(pending).rejects.toThrow('Timed out after 25ms');
    await started.promise;
    await rs.advanceTimersByTimeAsync(25);
    await assertion;
    await expect(agent.getUIContext()).rejects.toThrow('Timed out after 25ms');
    expect(signal.aborted).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(call).not.toHaveBeenCalled();
  });

  it('cancels initialization on destroy before opening any frame source', async () => {
    const started = deferred();
    let signal!: AbortSignal;
    const { agent, device } = setup({
      waitForInitialPageReady: {
        handler: async (ctx) => {
          signal = ctx.signal;
          started.resolve();
          await new Promise(() => {});
        },
      },
    });
    const pending = agent.startObserving();
    const assertion = expect(pending).rejects.toThrow('Agent destroyed');
    await started.promise;
    await agent.destroy();
    await assertion;
    expect(signal.aborted).toBe(true);
    expect(device.openFrameSource).not.toHaveBeenCalled();
    expect(device.destroy).toHaveBeenCalledOnce();
  });

  it('cancels one aiAct without cancelling shared initialization or replaying its cache', async () => {
    const started = deferred();
    const ready = deferred();
    const controller = new AbortController();
    let signal!: AbortSignal;
    const { agent, call } = setup({
      cache: { id: uuid() },
      waitForInitialPageReady: {
        handler: async (context) => {
          signal = context.signal;
          started.resolve();
          await ready.promise;
        },
      },
    });
    seedPlan(agent);
    const pending = agent.aiAct('submit twice', {
      abortSignal: controller.signal,
    });
    const otherCall = agent.getUIContext();
    const assertion = expect(pending).rejects.toThrow('cancel this action');
    await started.promise;
    controller.abort(new Error('cancel this action'));
    expect(signal.aborted).toBe(false);
    ready.resolve();
    await assertion;
    await expect(otherCall).resolves.toBeDefined();
    expect(call).not.toHaveBeenCalled();
    expect(standardPlan).not.toHaveBeenCalled();
  });

  it('gates direct Agent JavaScript access too', async () => {
    const handler = rs.fn(async () => {});
    const { agent, device } = setup({ waitForInitialPageReady: { handler } });
    await expect(agent.evaluateJavaScript('document.title')).resolves.toBe(
      'value',
    );
    expect(handler.mock.invocationCallOrder[0]).toBeLessThan(
      device.evaluateJavaScript.mock.invocationCallOrder[0],
    );
    expect(handler).toHaveBeenCalledOnce();
  });
});
