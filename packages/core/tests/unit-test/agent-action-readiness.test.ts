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
import type { ActionReadyContext, DeviceAction } from '@/types';
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
    defaultActionWait: rs.fn(async () => {}),
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

describe('Agent action readiness', () => {
  beforeEach(() => {
    rs.mocked(commonContextParser).mockResolvedValue(uiContext);
  });
  afterEach(() => {
    rs.restoreAllMocks();
    rs.clearAllMocks();
    rs.useRealTimers();
  });

  it.each(['playwright', 'android', 'ios', 'harmony', 'computer'])(
    'waits after every successful action on %s',
    async (type) => {
      const events: string[] = [];
      const observed: ActionReadyContext[] = [];
      const { agent, call, device } = setup(
        {
          waitForActionReady: async (context) => {
            observed.push(context);
            events.push('wait');
          },
        },
        type,
      );
      call.mockImplementation(async () => {
        events.push('action');
        return 'saved';
      });
      await agent.getUIContext();
      expect(observed).toHaveLength(0);
      await agent.aiTap('submit', { xpath: '//button' });
      await agent.aiTap('submit again', { xpath: '//button' });
      expect(events).toEqual(['action', 'wait', 'action', 'wait']);
      expect(observed[0].action.name).toBe('Tap');
      expect(observed[0].action.id).not.toBe(observed[1].action.id);
      expect(observed[0].action.param).toBeDefined();
      expect(device.defaultActionWait).not.toHaveBeenCalled();
      expect(device.beforeInvokeAction).toHaveBeenCalledTimes(2);
      expect(device.afterInvokeAction).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['aiQuery', 'aiAssert', 'aiWaitFor'] as const)(
    'does not wait for %s',
    async (method) => {
      const waitForActionReady = rs.fn(async () => {});
      const { agent } = setup({ waitForActionReady });
      await agent[method]('page is ready');
      expect(waitForActionReady).not.toHaveBeenCalled();
    },
  );

  it('does not call readiness when the action fails', async () => {
    const waitForActionReady = rs.fn(async () => {});
    const { agent, call } = setup({ waitForActionReady });
    call.mockRejectedValue(new Error('action failed'));
    await expect(agent.callActionInActionSpace('Submit')).rejects.toThrow(
      'action failed',
    );
    expect(waitForActionReady).not.toHaveBeenCalled();
  });

  function planTwoActions(shouldContinuePlanning = false) {
    rs.mocked(standardPlan).mockResolvedValue({
      actions: [
        { type: 'Submit', param: {}, thought: '' },
        { type: 'Submit', param: {}, thought: '' },
      ],
      yamlFlow: [],
      shouldContinuePlanning,
      log: '',
      rawResponse: '',
    });
  }

  it('stops aiAct during the post-plan screenshot before building another action batch', async () => {
    const controller = new AbortController();
    const started = deferred();
    const release = deferred();
    const { agent, call } = setup();
    planTwoActions();
    let captures = 0;
    rs.mocked(commonContextParser).mockImplementation(async () => {
      if (++captures === 2) {
        started.resolve();
        await release.promise;
      }
      return uiContext;
    });
    const pending = agent.aiAct('submit twice', {
      abortSignal: controller.signal,
    });
    const rejected = expect(pending).rejects.toThrow('stop after planning');
    await started.promise;
    expect(standardPlan).toHaveBeenCalledOnce();
    controller.abort(new Error('stop after planning'));
    release.resolve();
    await rejected;
    expect(call).not.toHaveBeenCalled();
    expect(standardPlan).toHaveBeenCalledOnce();
    expect(captures).toBe(2);
    expect(
      agent.dump.executions.flatMap((execution) => execution.tasks),
    ).toHaveLength(1);
  });

  it('blocks the next aiAct substep and post-action screenshot until ready', async () => {
    const started = deferred();
    const ready = deferred();
    let creates = 0;
    let screenshotsAtWait = 0;
    const { agent, call, device } = setup({
      waitForActionReady: async () => {
        if (++creates === 2) return;
        screenshotsAtWait = rs.mocked(commonContextParser).mock.calls.length;
        started.resolve();
        await ready.promise;
      },
    });
    planTwoActions();
    const pending = agent.aiAct('submit twice');
    await Promise.race([started.promise, pending]);
    expect(call).toHaveBeenCalledOnce();
    expect(device.afterInvokeAction).not.toHaveBeenCalled();
    expect(rs.mocked(commonContextParser).mock.calls.length).toBe(
      screenshotsAtWait,
    );
    ready.resolve();
    await pending;
    expect(call).toHaveBeenCalledTimes(2);
    expect(creates).toBe(2);
    const actions = agent.dump.executions
      .flatMap((execution) => execution.tasks)
      .filter((task) => task.subType === 'Submit');
    expect(actions.map((task) => task.actionReadiness)).toEqual([
      'custom',
      'custom',
    ]);
    expect(actions[0].timing?.waitForActionReadyEnd).toBeDefined();
  });

  it.each(['planned', 'cached'] as const)(
    'cancels a pending readiness callback in %s aiAct without running the next action',
    async (path) => {
      const controller = new AbortController();
      const started = deferred();
      const ready = deferred();
      let observedSignal: AbortSignal | undefined;
      const { agent, call, device } = setup({
        cache: { id: uuid() },
        waitForActionReady: async ({ signal }) => {
          observedSignal = signal;
          started.resolve();
          await ready.promise;
        },
      });
      if (path === 'cached') seedPlan(agent);
      else planTwoActions(true);
      const pending = agent.aiAct('submit twice', {
        abortSignal: controller.signal,
      });
      await Promise.race([started.promise, pending]);
      expect(observedSignal).toBeDefined();
      const rejected = expect(pending).rejects.toThrow('stop waiting');
      controller.abort(new Error('stop waiting'));
      await rejected;
      expect(observedSignal?.aborted).toBe(true);
      expect(call).toHaveBeenCalledOnce();
      expect(device.afterInvokeAction).not.toHaveBeenCalled();
      expect(standardPlan).toHaveBeenCalledTimes(path === 'planned' ? 1 : 0);
      ready.resolve();
    },
  );

  it('keeps default delays and platform waits when unconfigured', async () => {
    rs.useFakeTimers();
    const called = deferred();
    const { agent, call, device } = setup({
      waitAfterAction: 300,
    });
    call.mockImplementation(async () => {
      called.resolve();
      return 'saved';
    });
    const pending = agent.callActionInActionSpace('Submit');
    await called.promise;
    await rs.advanceTimersByTimeAsync(299);
    expect(device.defaultActionWait).not.toHaveBeenCalled();
    await rs.advanceTimersByTimeAsync(1);
    await pending;
    expect(device.defaultActionWait).toHaveBeenCalledOnce();
    expect(device.afterInvokeAction).toHaveBeenCalledOnce();
  });

  it('an empty callback bypasses both generic delays and preserves lifecycle callbacks', async () => {
    rs.useFakeTimers();
    const { agent, device } = setup({
      waitAfterAction: 300,
      waitForActionReady: async () => {},
    });
    device.actionSpace()[0].delayBeforeRunner = 200;
    const started = Date.now();
    await agent.callActionInActionSpace('Submit');
    expect(Date.now()).toBe(started);
    expect(device.defaultActionWait).not.toHaveBeenCalled();
    expect(device.afterInvokeAction).toHaveBeenCalledOnce();
  });

  it('waits for cached actions without invoking planning', async () => {
    const waitForActionReady = rs.fn(async () => {});
    const { agent, call } = setup({
      cache: { id: uuid() },
      waitForActionReady,
    });
    seedPlan(agent);
    await agent.aiAct('submit twice');
    expect(waitForActionReady).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalledTimes(2);
    expect(standardPlan).not.toHaveBeenCalled();
  });

  it.each(['planned', 'cached'] as const)(
    'stops %s actions on readiness failure without replay or replanning',
    async (path) => {
      const waitForActionReady = rs.fn(async () => {
        throw new Error('login did not become ready');
      });
      const { agent, call } = setup({
        cache: { id: uuid() },
        waitForActionReady,
      });
      if (path === 'cached') seedPlan(agent);
      else planTwoActions(true);
      await expect(agent.aiAct('submit twice')).rejects.toThrow(
        'login did not become ready',
      );
      expect(call).toHaveBeenCalledOnce();
      expect(waitForActionReady).toHaveBeenCalledOnce();
      expect(standardPlan).toHaveBeenCalledTimes(path === 'planned' ? 1 : 0);
    },
  );

  it('stops YAML even when continueOnError is set on the failed task', async () => {
    const { agent, call } = setup({
      waitForActionReady: async () => {
        throw new Error('not ready');
      },
    });
    const script =
      'tasks:\n  - name: first\n    continueOnError: true\n    flow:\n      - submit: {}\n  - name: second\n    flow:\n      - submit: {}\n';
    await expect(agent.runYaml(script)).rejects.toThrow('not ready');
    expect(call).toHaveBeenCalledOnce();
  });
});
