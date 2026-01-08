import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalExecutionAdapter } from '../src/adapters/local-execution';
import type { PlaygroundAgent } from '../src/types';

const MIDSCENE_REPLANNING_CYCLE_LIMIT = 'MIDSCENE_REPLANNING_CYCLE_LIMIT';

describe('LocalExecutionAdapter - Config Recreation', () => {
  let mockAgent: PlaygroundAgent;
  let mockAgentFactory: () => Promise<PlaygroundAgent>;
  let agentFactoryCallCount: number;

  beforeEach(() => {
    vi.unstubAllEnvs();
    agentFactoryCallCount = 0;

    // Create a mock agent
    const createMockAgent = (): PlaygroundAgent =>
      ({
        interface: {
          interfaceType: 'puppeteer',
          actionSpace: () => [],
        } as any,
        getActionSpace: vi.fn(async () => []),
        destroy: vi.fn(async () => {}),
        dumpDataString: vi.fn(() => '{"executions":[]}'),
        reportHTMLString: vi.fn(() => '<html></html>'),
        writeOutActionDumps: vi.fn(),
        resetDump: vi.fn(),
        addDumpUpdateListener: vi.fn(() => () => {}),
      }) as any;

    mockAgent = createMockAgent();

    // Create a factory that returns new agents
    mockAgentFactory = vi.fn(async () => {
      agentFactoryCallCount++;
      console.log(`Agent factory called (count: ${agentFactoryCallCount})`);
      return createMockAgent();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should recreate agent when overrideConfig is called', async () => {
    const adapter = new LocalExecutionAdapter(mockAgent, mockAgentFactory);

    // Initial state - factory not called yet
    expect(agentFactoryCallCount).toBe(0);
    expect(mockAgent.destroy).not.toHaveBeenCalled();

    // Override config - does not trigger recreation
    await adapter.overrideConfig({
      [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '25',
    });

    // Agent should NOT be destroyed yet
    expect(mockAgent.destroy).not.toHaveBeenCalled();
    expect(agentFactoryCallCount).toBe(0);

    // Execute action - this should destroy old agent and create new one
    await adapter.executeAction(
      'ai',
      { type: 'ai', prompt: 'test prompt' },
      { requestId: 'test-request' },
    );

    // Now agent should be destroyed and recreated
    expect(mockAgent.destroy).toHaveBeenCalledTimes(1);
    expect(agentFactoryCallCount).toBe(1);
  });

  it('should work when agent is initially undefined', async () => {
    const adapter = new LocalExecutionAdapter(undefined, mockAgentFactory);

    // Override config - should not crash
    await adapter.overrideConfig({
      [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '25',
    });

    // Factory should not be called yet (only on execution)
    expect(agentFactoryCallCount).toBe(0);
  });

  it('should work when agentFactory is not provided', async () => {
    const adapter = new LocalExecutionAdapter(mockAgent);

    // Override config - should not crash even without factory
    await adapter.overrideConfig({
      [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '25',
    });

    // Agent should not be destroyed without factory
    expect(mockAgent.destroy).not.toHaveBeenCalled();
  });

  it('should handle recreation failure gracefully', async () => {
    const failingFactory = vi.fn(async () => {
      throw new Error('Factory failed');
    });

    const adapter = new LocalExecutionAdapter(mockAgent, failingFactory);

    // Override config - should not throw
    await expect(
      adapter.overrideConfig({
        [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '25',
      }),
    ).resolves.not.toThrow();

    // Config is updated but agent not destroyed yet
    expect(mockAgent.destroy).not.toHaveBeenCalled();
    expect(failingFactory).not.toHaveBeenCalled();

    // Execute action - this should destroy old agent and attempt recreation
    await expect(
      adapter.executeAction(
        'ai',
        { type: 'ai', prompt: 'test' },
        { requestId: 'test-request' },
      ),
    ).rejects.toThrow('Factory failed');

    // Agent should be destroyed and factory should be called
    expect(mockAgent.destroy).toHaveBeenCalledTimes(1);
    expect(failingFactory).toHaveBeenCalledTimes(1);
  });

  it('should recreate agent multiple times for multiple config changes', async () => {
    const adapter = new LocalExecutionAdapter(mockAgent, mockAgentFactory);

    // First config change
    await adapter.overrideConfig({
      [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '25',
    });
    expect(agentFactoryCallCount).toBe(0);

    // Execute - destroys old agent and creates new one
    await adapter.executeAction(
      'ai',
      { type: 'ai', prompt: 'test 1' },
      { requestId: 'test-1' },
    );
    expect(mockAgent.destroy).toHaveBeenCalledTimes(1);
    expect(agentFactoryCallCount).toBe(1);

    // Second config change
    await adapter.overrideConfig({
      [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '30',
    });

    // Execute - destroys the agent created in first execution and creates new one
    await adapter.executeAction(
      'ai',
      { type: 'ai', prompt: 'test 2' },
      { requestId: 'test-2' },
    );
    // mockAgent was destroyed once, the new agent from factory was destroyed once
    expect(agentFactoryCallCount).toBe(2);

    // Third config change
    await adapter.overrideConfig({
      [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '35',
    });

    // Execute - destroys and creates again
    await adapter.executeAction(
      'ai',
      { type: 'ai', prompt: 'test 3' },
      { requestId: 'test-3' },
    );
    expect(agentFactoryCallCount).toBe(3);
  });
});
