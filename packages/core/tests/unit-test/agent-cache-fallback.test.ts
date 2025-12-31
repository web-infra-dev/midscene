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

  it('should pass failure context to AI planning on fallback', async () => {
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

    // Mock runYaml to throw enhanced error with executionContext (new format)
    const mockError = new Error('YAML execution failed');
    (mockError as any).executionContext = {
      successfulTasks: ['Click login', 'Enter username'],
      failedTasks: [
        { name: 'Enter password', error: new Error('Element not found') },
      ],
      totalTasks: 3,
      fallbackContext: `Previous cached workflow execution failed at step 3/3:

Completed successfully:
  ✓ Step 1/3: "Click login"
  ✓ Step 2/3: "Enter username"

Failed:
  ✗ Step 3/3: "Enter password"
    Error: Element not found

Please continue from Step 3 and avoid repeating the successful steps.`,
      completedTasks: [
        { index: 0, name: 'Click login' },
        { index: 1, name: 'Enter username' },
      ],
      failedTasksDetailed: [
        { index: 2, name: 'Enter password', error: new Error('Element not found'), totalSteps: 1 },
      ],
      pendingTasks: [],
    };

    const runYamlSpy = vi.spyOn(agent, 'runYaml').mockRejectedValue(mockError);

    // Mock taskExecutor methods
    agent.taskExecutor = {
      loadYamlFlowAsPlanning: vi.fn().mockResolvedValue(undefined),
      action: vi
        .fn()
        .mockResolvedValue({ output: { result: { success: true } } }),
    } as any;

    // Mock model config manager
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

    // Verify that enhanced context was passed with new format
    const actionCall = (agent.taskExecutor.action as any).mock.calls[0];
    const contextParam = actionCall[4]; // 5th parameter is aiActContext

    expect(contextParam).toContain('Previous cached workflow execution failed at step 3/3');
    expect(contextParam).toContain('Step 1/3:');
    expect(contextParam).toContain('Step 2/3:');
    expect(contextParam).toContain('Step 3/3:');
    expect(contextParam).toContain('Completed successfully:');
    expect(contextParam).toContain('Failed:');
    expect(contextParam).toContain('✓ Step 1/3: "Click login"');
    expect(contextParam).toContain('✓ Step 2/3: "Enter username"');
    expect(contextParam).toContain('✗ Step 3/3: "Enter password"');
    expect(contextParam).toContain('Element not found');
    expect(contextParam).toContain('avoid repeating the successful steps');
  });

  it('should append failure context to existing aiActContext', async () => {
    // Create agent with aiActContext
    const agentWithContext = new Agent(createMockInterface(), {
      aiActContext: 'User is on login page',
    });

    // Mock cache
    const mockCache = {
      cacheContent: {
        yamlWorkflow: 'tasks:\n  - name: test\n    flow: invalid',
      },
    };

    agentWithContext.taskCache = {
      isCacheResultUsed: true,
      matchPlanCache: vi.fn().mockReturnValue(mockCache),
    } as any;

    // Mock runYaml to throw enhanced error with new format
    const mockError = new Error('YAML execution failed');
    (mockError as any).executionContext = {
      successfulTasks: ['Click login'],
      failedTasks: [{ name: 'Enter username', error: new Error('Field not found') }],
      totalTasks: 2,
      fallbackContext: `Previous cached workflow execution failed at step 2/2:

Completed successfully:
  ✓ Step 1/2: "Click login"

Failed:
  ✗ Step 2/2: "Enter username"
    Error: Field not found

Please continue from Step 2 and avoid repeating the successful steps.`,
      completedTasks: [{ index: 0, name: 'Click login' }],
      failedTasksDetailed: [{ index: 1, name: 'Enter username', error: new Error('Field not found'), totalSteps: 1 }],
      pendingTasks: [],
    };

    vi.spyOn(agentWithContext, 'runYaml').mockRejectedValue(mockError);

    // Mock taskExecutor
    agentWithContext.taskExecutor = {
      loadYamlFlowAsPlanning: vi.fn().mockResolvedValue(undefined),
      action: vi
        .fn()
        .mockResolvedValue({ output: { result: { success: true } } }),
    } as any;

    agentWithContext.modelConfigManager = {
      getModelConfig: vi.fn().mockReturnValue({ vlMode: 'normal' }),
    } as any;

    vi.spyOn(
      agentWithContext as any,
      'resolveReplanningCycleLimit',
    ).mockReturnValue(3);

    await agentWithContext.aiAct('test task');

    // Verify context includes both original and failure context
    const actionCall = (agentWithContext.taskExecutor.action as any).mock
      .calls[0];
    const contextParam = actionCall[4];

    expect(contextParam).toContain('User is on login page');
    expect(contextParam).toContain('--- Cache Execution Failed ---');
    expect(contextParam).toContain('Previous cached workflow execution failed at step 2/2');
    expect(contextParam).toContain('✓ Step 1/2: "Click login"');
    expect(contextParam).toContain('✗ Step 2/2: "Enter username"');
  });

  it('should handle fallback when executionContext is not available', async () => {
    // Mock cache
    const mockCache = {
      cacheContent: {
        yamlWorkflow: 'tasks:\n  - name: test\n    flow: invalid',
      },
    };

    agent.taskCache = {
      isCacheResultUsed: true,
      matchPlanCache: vi.fn().mockReturnValue(mockCache),
    } as any;

    // Mock runYaml to throw simple error (no executionContext)
    const simpleError = new Error('Simple execution error');
    vi.spyOn(agent, 'runYaml').mockRejectedValue(simpleError);

    // Mock taskExecutor
    agent.taskExecutor = {
      loadYamlFlowAsPlanning: vi.fn().mockResolvedValue(undefined),
      action: vi
        .fn()
        .mockResolvedValue({ output: { result: { success: true } } }),
    } as any;

    agent.modelConfigManager = {
      getModelConfig: vi.fn().mockReturnValue({ vlMode: 'normal' }),
    } as any;

    vi.spyOn(agent as any, 'resolveReplanningCycleLimit').mockReturnValue(3);

    await agent.aiAct('test task');

    // Verify basic fallback context
    const actionCall = (agent.taskExecutor.action as any).mock.calls[0];
    const contextParam = actionCall[4];

    expect(contextParam).toContain('Previous cached workflow execution failed');
    expect(contextParam).toContain('Simple execution error');
    expect(contextParam).toContain('retry with a different approach');
  });
});
