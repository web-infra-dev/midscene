import { Agent, type PlanningCache, type TaskCache } from '@/agent';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function createAgentWithPlanCache(yamlWorkflow = stalePlanYaml) {
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
    prompt: 'dismiss optional popup',
    yamlWorkflow,
  });
  internal.cacheOriginalLength = 1;

  return { agent, internal };
}

describe('aiAct plan cache fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replans and refreshes plan cache when cached YAML fails', async () => {
    const { agent, internal } = createAgentWithPlanCache();
    const taskExecutor = {
      loadYamlFlowAsPlanning: vi.fn().mockResolvedValue(undefined),
      action: vi.fn().mockResolvedValue({
        output: {
          output: 'replanned',
          yamlFlow: [{ aiTap: 'stable submit button' }],
        },
      }),
    };
    agent.taskExecutor = taskExecutor as any;

    vi.spyOn(agent, 'runYaml').mockRejectedValue(
      new Error('optional popup close button not found'),
    );

    await expect(agent.aiAct('dismiss optional popup')).resolves.toBe(
      'replanned',
    );

    expect(taskExecutor.loadYamlFlowAsPlanning).toHaveBeenCalledWith(
      'dismiss optional popup',
      stalePlanYaml,
      undefined,
    );
    expect(taskExecutor.action).toHaveBeenCalledOnce();
    expect(internal.cache.caches).toHaveLength(1);
    expect(internal.cache.caches[0].yamlWorkflow).toContain(
      'stable submit button',
    );
  });

  it('disables the stale plan cache when fallback succeeds without a new flow', async () => {
    const { agent, internal } = createAgentWithPlanCache();
    agent.taskExecutor = {
      loadYamlFlowAsPlanning: vi.fn().mockResolvedValue(undefined),
      action: vi.fn().mockResolvedValue({
        output: {
          output: 'nothing to do',
          yamlFlow: [],
        },
      }),
    } as any;

    vi.spyOn(agent, 'runYaml').mockRejectedValue(
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
      loadYamlFlowAsPlanning: vi.fn().mockResolvedValue(undefined),
      action: vi.fn().mockResolvedValue({
        output: {
          output: 'replanned',
          yamlFlow: [{ aiTap: 'stable submit button' }],
        },
      }),
    };
    agent.taskExecutor = taskExecutor as any;
    const runYaml = vi.spyOn(agent, 'runYaml').mockResolvedValue({
      result: {},
    });

    await expect(
      agent.aiAct('dismiss optional popup'),
    ).resolves.toBeUndefined();

    expect(runYaml).toHaveBeenCalledWith(stalePlanYaml);
    expect(taskExecutor.action).not.toHaveBeenCalled();
  });
});
