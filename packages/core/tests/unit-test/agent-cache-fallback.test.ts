import { Agent } from '@/agent';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const createMockInterface = () =>
  ({
    interfaceType: 'puppeteer',
    actionSpace: () => [],
  }) as any;

describe('Agent cache fallback', () => {
  let agent: Agent<any>;

  beforeEach(() => {
    vi.mock('openai');
    agent = new Agent(createMockInterface());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fall back to AI planning when cache execution fails', async () => {
    // Mock cache with yaml workflow
    const mockCache = {
      cacheContent: {
        yamlWorkflow: 'invalid-yaml-content',
      },
    };

    // Mock taskCache to return cache match
    agent.taskCache = {
      isCacheResultUsed: true,
      findCache: vi.fn().mockResolvedValue(mockCache),
    } as any;

    // Mock runYaml to throw error (simulating cache execution failure)
    const runYamlSpy = vi.spyOn(agent, 'runYaml').mockRejectedValue(new Error('YAML execution failed'));

    // Mock taskExecutor methods
    agent.taskExecutor = {
      loadYamlFlowAsPlanning: vi.fn(),
      action: vi.fn().mockResolvedValue({ output: { result: { success: true } } }),
    } as any;

    const result = await agent.aiAct('test task');

    // Verify runYaml was called and failed
    expect(runYamlSpy).toHaveBeenCalledWith('invalid-yaml-content');
    
    // Verify fallback to normal execution
    expect(agent.taskExecutor.action).toHaveBeenCalled();
  });
});
