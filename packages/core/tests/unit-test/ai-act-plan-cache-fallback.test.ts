import { Agent, type PlanningCache, type TaskCache } from '@/agent';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const modelConfig = {
  [MIDSCENE_MODEL_NAME]: 'qwen2.5-vl-max',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.sample.com/v1',
  [MIDSCENE_MODEL_FAMILY]: 'qwen2.5-vl' as const,
};

const stalePlanYaml = `tasks:
  - name: dismiss optional popup
    flow:
      - aiTap: optional popup close button
`;

function getTaskCacheInternal(taskCache: TaskCache) {
  return taskCache as unknown as {
    cache: { caches: PlanningCache[] };
    cacheOriginalLength: number;
  };
}

function createAgentWithPlanCache(
  yamlWorkflow = stalePlanYaml,
  prompt = 'dismiss optional popup',
) {
  const agent = new Agent(
    {
      interfaceType: 'puppeteer',
      actionSpace: () => [],
    } as any,
    {
      cache: { id: uuid() },
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig,
    },
  );

  const taskCache = agent.taskCache!;
  const internal = getTaskCacheInternal(taskCache);
  internal.cache.caches.push({
    type: 'plan',
    prompt,
    yamlWorkflow,
  });
  internal.cacheOriginalLength = 1;

  return { agent, internal };
}

describe('aiAct plan cache fallback', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it('rechecks a cached WaitFor on each replay and stops on a later failure', async () => {
    const agent = new Agent(
      {
        interfaceType: 'puppeteer',
        actionSpace: () => [],
        size: async () => ({ width: 1, height: 1 }),
        screenshotBase64: async () =>
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      } as any,
      {
        planningWaitFor: true,
        generateReport: false,
        autoPrintReportMsg: false,
        cache: { id: uuid() },
        modelConfig,
      },
    );
    const yamlWorkflow = `tasks:
  - name: wait for readiness
    flow:
      - WaitFor: ''
        condition: ready
`;
    rs.spyOn(agent.taskCache!, 'matchPlanCache').mockReturnValue({
      cacheUsable: true,
      cacheContent: { type: 'plan', prompt: 'wait', yamlWorkflow },
    } as any);
    const wait = rs
      .spyOn(agent, 'aiWaitFor')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('condition is no longer ready'));
    const planning = rs
      .spyOn(agent.taskExecutor, 'action')
      .mockRejectedValue(new Error('unexpected replanning'));
    await agent.aiAct('wait');
    await expect(agent.aiAct('wait')).rejects.toThrow(
      'condition is no longer ready',
    );
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(
      'ready',
      expect.objectContaining({ timeoutMs: 30000, checkIntervalMs: 2000 }),
    );
    expect(planning).not.toHaveBeenCalled();
  });

  it('disables the stale plan cache instead of caching fallback flow when cached YAML fails', async () => {
    const prompt = 'complete checkout with optional popup';
    const partialPlanYaml = `tasks:
  - name: complete checkout with optional popup
    flow:
      - aiTap: open checkout summary
      - aiTap: optional popup close button
      - aiTap: final confirmation button
`;
    const { agent, internal } = createAgentWithPlanCache(
      partialPlanYaml,
      prompt,
    );
    const taskExecutor = {
      loadYamlFlowAsPlanning: rs.fn().mockResolvedValue(undefined),
      action: rs.fn().mockResolvedValue({
        output: {
          output: 'completed after fallback',
          yamlFlow: [{ aiTap: 'final confirmation button' }],
        },
      }),
    };
    agent.taskExecutor = taskExecutor as any;

    rs.spyOn(agent, 'runYaml').mockRejectedValue(
      new Error('optional popup close button not found after opening summary'),
    );

    await expect(agent.aiAct(prompt)).resolves.toBe('completed after fallback');

    expect(taskExecutor.loadYamlFlowAsPlanning).toHaveBeenCalledWith(
      prompt,
      partialPlanYaml,
      undefined,
    );
    expect(taskExecutor.action).toHaveBeenCalledOnce();
    expect(internal.cache.caches).toHaveLength(1);
    expect(internal.cache.caches[0].yamlWorkflow).toContain('flow: []');
    expect(internal.cache.caches[0].yamlWorkflow).not.toContain(
      'final confirmation button',
    );
  });

  it('disables the stale plan cache when fallback succeeds without a new flow', async () => {
    const { agent, internal } = createAgentWithPlanCache();
    agent.taskExecutor = {
      loadYamlFlowAsPlanning: rs.fn().mockResolvedValue(undefined),
      action: rs.fn().mockResolvedValue({
        output: {
          output: 'nothing to do',
          yamlFlow: [],
        },
      }),
    } as any;

    rs.spyOn(agent, 'runYaml').mockRejectedValue(
      new Error('optional popup close button not found'),
    );

    await expect(agent.aiAct('dismiss optional popup')).resolves.toBe(
      'nothing to do',
    );

    expect(internal.cache.caches).toHaveLength(1);
    expect(internal.cache.caches[0].yamlWorkflow).toContain('flow: []');
  });

  it('keeps using the cached YAML when it succeeds', async () => {
    const { agent } = createAgentWithPlanCache();
    const taskExecutor = {
      loadYamlFlowAsPlanning: rs.fn().mockResolvedValue(undefined),
      action: rs.fn().mockResolvedValue({
        output: {
          output: 'replanned',
          yamlFlow: [{ aiTap: 'stable submit button' }],
        },
      }),
    };
    agent.taskExecutor = taskExecutor as any;
    const runYaml = rs.spyOn(agent, 'runYaml').mockResolvedValue({
      result: {},
    });

    await expect(
      agent.aiAct('dismiss optional popup'),
    ).resolves.toBeUndefined();

    expect(runYaml).toHaveBeenCalledWith(stalePlanYaml);
    expect(taskExecutor.action).not.toHaveBeenCalled();
  });
});
