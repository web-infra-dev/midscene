import { beforeEach, describe, expect, it } from 'vitest';

// This test verifies that the AI fixture properly maintains 'this' context
// when dynamically calling agent methods through bracket notation.
// See: packages/web-integration/src/playwright/ai-fixture.ts:183

describe('PlaywrightAiFixture this binding', () => {
  // Mock agent class that simulates the PlaywrightAgent behavior
  class MockAgent {
    private instanceData = 'mock-instance-data';

    // Simulate a method that requires 'this' context
    async aiTap(prompt: string) {
      // This will throw if 'this' is undefined
      return `${this.instanceData}: tap ${prompt}`;
    }

    async aiQuery(prompt: string) {
      return `${this.instanceData}: query ${prompt}`;
    }

    // Simulate callActionInActionSpace which requires 'this'
    async callActionInActionSpace(type: string, opt?: any) {
      // Access instance property to verify 'this' binding
      return `${this.instanceData}: ${type} ${JSON.stringify(opt)}`;
    }
  }

  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
  });

  it('should maintain this context when calling methods with .bind()', async () => {
    const aiActionType = 'aiTap';
    type AgentMethod = (prompt: string, ...restArgs: any[]) => Promise<any>;

    // This is the pattern used in ai-fixture.ts:183 (with .bind)
    const result = await (agent[aiActionType] as AgentMethod).bind(agent)(
      'test button',
    );

    // Should work correctly because 'this' is bound
    expect(result).toBe('mock-instance-data: tap test button');
  });

  it('should lose this context when calling methods without .bind()', async () => {
    const aiActionType = 'aiTap';
    type AgentMethod = (prompt: string, ...restArgs: any[]) => Promise<any>;

    // This is the WRONG pattern (without .bind)
    const unboundMethod = agent[aiActionType] as AgentMethod;

    // Should throw because 'this' is undefined
    await expect(unboundMethod('test button')).rejects.toThrow();
  });

  it('should work with different agent methods using .bind()', async () => {
    const methods = ['aiTap', 'aiQuery'] as const;
    type AgentMethod = (prompt: string, ...restArgs: any[]) => Promise<any>;

    for (const method of methods) {
      const result = await (agent[method] as AgentMethod).bind(agent)(
        'test prompt',
      );

      expect(result).toContain('mock-instance-data');
    }
  });

  it('should preserve this when passing additional arguments', async () => {
    const aiActionType = 'aiTap';
    type AgentMethod = (prompt: string, ...restArgs: any[]) => Promise<any>;

    const args = [{ timeout: 5000 }];
    const result = await (agent[aiActionType] as AgentMethod).bind(agent)(
      'test button',
      ...args,
    );

    expect(result).toBe('mock-instance-data: tap test button');
  });

  it('should verify that callActionInActionSpace requires this context', async () => {
    // Create an unbound reference to the method
    const unboundMethod = agent.callActionInActionSpace;

    // Should fail because 'this' is lost
    await expect(unboundMethod('Tap', { locate: 'button' })).rejects.toThrow();

    // Should work when bound
    const boundMethod = agent.callActionInActionSpace.bind(agent);
    const result = await boundMethod('Tap', { locate: 'button' });
    expect(result).toContain('mock-instance-data');
  });

  it('should demonstrate the ai-fixture pattern is correct', async () => {
    // This simulates the exact pattern used in ai-fixture.ts:183-186
    const aiActionType = 'aiTap';
    const taskPrompt = 'click submit button';
    const args: any[] = [];

    type AgentMethod = (prompt: string, ...restArgs: any[]) => Promise<any>;

    // The CORRECT pattern with .bind(agent)
    const result = await (agent[aiActionType] as AgentMethod).bind(agent)(
      taskPrompt,
      ...(args || []),
    );

    expect(result).toBe('mock-instance-data: tap click submit button');
  });
});
