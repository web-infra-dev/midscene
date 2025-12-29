import { Agent } from '@/agent';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const defaultModelConfig = {
  [MIDSCENE_MODEL_NAME]: 'qwen2.5-vl-max',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.sample.com/v1',
  [MIDSCENE_MODEL_FAMILY]: 'qwen2.5-vl' as const,
};

const createMockInterface = () =>
  ({
    interfaceType: 'puppeteer',
    actionSpace: () => [],
  }) as any;

describe('Agent cache fallback', () => {
  let agent: Agent<any>;

  beforeEach(() => {
    vi.mock('openai');
    Object.assign(process.env, defaultModelConfig);
    agent = new Agent(createMockInterface());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fall back to AI planning when cache execution fails', async () => {
    // Mock cache with yaml workflow
    const mockCache = {
      cacheContent: {
        yamlWorkflow: 'tasks:\n  - name: test\n    flow: invalid',
      },
    };

    // Mock taskCache to return cache match
    const matchPlanCacheSpy = vi.fn().mockReturnValue(mockCache);
    agent.taskCache = {
      isCacheResultUsed: true,
      matchPlanCache: matchPlanCacheSpy,
    } as any;

    // Mock runYaml to throw error (simulating cache execution failure)
    const runYamlSpy = vi
      .spyOn(agent, 'runYaml')
      .mockRejectedValue(new Error('YAML execution failed'));

    // Mock taskExecutor methods - make loadYamlFlowAsPlanning async
    agent.taskExecutor = {
      loadYamlFlowAsPlanning: vi.fn().mockResolvedValue(undefined),
      action: vi
        .fn()
        .mockResolvedValue({ output: { result: { success: true } } }),
    } as any;

    // Mock model config manager to return non-vlm-ui-tars config
    agent.modelConfigManager = {
      getModelConfig: vi.fn().mockReturnValue({ vlMode: 'normal' }),
    } as any;

    // Mock resolveReplanningCycleLimit
    vi.spyOn(agent as any, 'resolveReplanningCycleLimit').mockReturnValue(3);

    const result = await agent.aiAct('test task');

    // Verify runYaml was called and failed
    expect(runYamlSpy).toHaveBeenCalledWith(
      'tasks:\n  - name: test\n    flow: invalid',
    );

    // Verify fallback to normal execution
    expect(agent.taskExecutor.action).toHaveBeenCalled();
  });
});
