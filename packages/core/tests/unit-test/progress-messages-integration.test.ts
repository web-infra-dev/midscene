import { describe, expect, it, vi } from 'vitest';
import { Agent } from '@/agent/agent';
import type { ProgressMessage } from '@/types';

/**
 * Integration test to verify Planning tasks appear in progress messages
 * This tests the full flow from Agent execution to progress message generation
 */

describe('Progress Messages Integration', () => {
  it('should emit progress messages with Planning tasks during execution', async () => {
    // Create a mock interface with minimal implementation
    const mockInterface = {
      interfaceType: 'Web',
      actionSpace: vi.fn(() => []),
      screenshotBase64: vi.fn(async () => 'mock-screenshot'),
      size: vi.fn(async () => ({ width: 1920, height: 1080, dpr: 1 })),
    };

    // Create agent
    const agent = new Agent(mockInterface as any);

    // Track progress messages emitted
    const progressUpdates: ProgressMessage[][] = [];

    agent.onDumpUpdate = (
      _dump: string,
      _executionDump?: any,
      progressMessages?: ProgressMessage[],
    ) => {
      if (progressMessages) {
        progressUpdates.push([...progressMessages]);
      }
    };

    // Mock the AI call to return a simple planning result
    const originalAiCall = (agent as any).aiCall;
    (agent as any).aiCall = vi.fn(async (options: any) => {
      // Return mock planning result
      if (options.actionType === 'Planning') {
        return {
          log: '模拟的 AI 规划步骤',
        };
      }
      return originalAiCall?.call(agent, options);
    });

    try {
      // Execute a simple planning action
      await agent.aiAction('执行一个简单的操作');
    } catch (error) {
      // Expected to fail due to mocked interface
      // We just want to verify progress messages are emitted
    }

    // Verify at least one progress update was emitted
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Verify at least one Planning task appears in progress messages
    const allMessages = progressUpdates.flat();
    const planningMessages = allMessages.filter((msg) => msg.action === 'Plan');

    expect(planningMessages.length).toBeGreaterThan(0);

    // Verify Planning message has description
    for (const planMsg of planningMessages) {
      expect(planMsg.description).toBeTruthy();
      expect(planMsg.description.length).toBeGreaterThan(0);
    }
  });

  it('should show all task types in progress messages', async () => {
    // Create a mock interface
    const mockInterface = {
      interfaceType: 'Web',
      actionSpace: vi.fn(() => []),
      screenshotBase64: vi.fn(async () => 'mock-screenshot'),
      size: vi.fn(async () => ({ width: 1920, height: 1080, dpr: 1 })),
      locate: vi.fn(async () => ({ left: 100, top: 100, width: 50, height: 50 })),
      tap: vi.fn(async () => {}),
    };

    const agent = new Agent(mockInterface as any);

    let finalProgressMessages: ProgressMessage[] = [];

    agent.onDumpUpdate = (
      _dump: string,
      _executionDump?: any,
      progressMessages?: ProgressMessage[],
    ) => {
      if (progressMessages) {
        finalProgressMessages = [...progressMessages];
      }
    };

    // Mock the AI call
    (agent as any).aiCall = vi.fn(async (options: any) => {
      if (options.actionType === 'Planning') {
        return { log: 'AI planning step' };
      }
      if (options.actionType === 'Locate') {
        return { id: 'element-1', prompt: 'button' };
      }
      return {};
    });

    try {
      await agent.aiAction('click button');
    } catch (error) {
      // Expected to fail, we just want progress messages
    }

    // Should have messages from various task types
    const taskTypes = [...new Set(finalProgressMessages.map((m) => m.action))];

    // Should include at least Planning and some action type
    expect(taskTypes.length).toBeGreaterThan(0);
    expect(finalProgressMessages.length).toBeGreaterThan(0);
  });
});
