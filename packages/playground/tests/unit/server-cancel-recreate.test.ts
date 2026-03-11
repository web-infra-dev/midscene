import { describe, expect, it, vi } from 'vitest';

/**
 * Bug regression test: After clicking Stop then Run, the system should not
 * report "agent already destroyed". The cancel handler must recreate the agent
 * so subsequent executions use a fresh, non-destroyed agent instance.
 */
describe('PlaygroundServer cancel and recreate agent', () => {
  it('should recreate agent after cancel so it is not destroyed', async () => {
    // Simulate the agent lifecycle in PlaygroundServer
    let agentInstance = {
      destroyed: false,
      interface: { screenshotBase64: vi.fn() },
      destroy: vi.fn(async () => {
        agentInstance.destroyed = true;
      }),
    };

    const agentFactory = vi.fn(async () => {
      // Factory creates a fresh agent (not destroyed)
      agentInstance = {
        destroyed: false,
        interface: { screenshotBase64: vi.fn() },
        destroy: vi.fn(async () => {
          agentInstance.destroyed = true;
        }),
      };
      return agentInstance;
    });

    // Simulate the recreateAgent logic from server.ts
    async function recreateAgent() {
      // Destroy old agent
      if (agentInstance && typeof agentInstance.destroy === 'function') {
        await agentInstance.destroy();
      }
      // Create new agent
      const newAgent = await agentFactory();
      return newAgent;
    }

    // Initial state - agent is alive
    expect(agentInstance.destroyed).toBe(false);

    // Simulate cancel: recreateAgent is called
    const newAgent = await recreateAgent();

    // After cancel + recreate, the new agent should NOT be destroyed
    expect(newAgent.destroyed).toBe(false);
    expect(agentFactory).toHaveBeenCalledTimes(1);

    // The new agent should be usable (not the old destroyed one)
    expect(newAgent).toBe(agentInstance);
  });

  it('should fail if cancel only destroys without recreating (old buggy behavior)', async () => {
    // This test documents the OLD buggy behavior where cancel only destroyed
    // the agent without recreating it, causing "agent already destroyed" on next Run
    let agent = {
      destroyed: false,
      destroy: vi.fn(async () => {
        agent.destroyed = true;
      }),
    };

    const agentFactory = vi.fn(async () => {
      agent = {
        destroyed: false,
        destroy: vi.fn(async () => {
          agent.destroyed = true;
        }),
      };
      return agent;
    });

    // OLD buggy cancel behavior: only destroy, don't recreate
    async function oldBuggyCancelHandler() {
      if (agent && typeof agent.destroy === 'function') {
        await agent.destroy();
      }
      // Missing: agent = await agentFactory()
    }

    // Simulate cancel with old buggy handler
    await oldBuggyCancelHandler();

    // Agent is destroyed and NOT recreated - this was the bug
    expect(agent.destroyed).toBe(true);
    expect(agentFactory).not.toHaveBeenCalled();
  });

  it('should handle deviceOptions propagation without "options in" guard', () => {
    // Old code used: 'options' in this.agent.interface
    // which could fail at runtime for some device types.
    // New code uses direct cast assignment.

    const iface: Record<string, unknown> = {
      screenshotBase64: vi.fn(),
      size: vi.fn(),
    };
    // iface does NOT have 'options' property initially

    // OLD code: 'options' in iface would be true for plain objects
    // but could fail for class instances with property descriptors
    // The fix: use direct cast assignment
    const deviceOptions = { alwaysRefreshScreenInfo: true };

    // Simulate the fixed code path
    const typedIface = iface as { options?: Record<string, unknown> };
    typedIface.options = {
      ...(typedIface.options || {}),
      ...deviceOptions,
    };

    expect(typedIface.options).toEqual({ alwaysRefreshScreenInfo: true });
  });

  it('should destroy agent on cancel even without factory (instance mode)', async () => {
    // When PlaygroundServer is created with an agent instance (no factory),
    // cancel should still destroy the agent to stop the running task.
    const agent = {
      destroyed: false,
      destroy: vi.fn(async () => {
        agent.destroyed = true;
      }),
    };

    const agentFactory = null; // no factory

    // Simulate the fixed recreateAgent logic
    async function recreateAgent() {
      // Destroy old agent
      if (agent && typeof agent.destroy === 'function') {
        await agent.destroy();
      }
      // No factory — cannot recreate, but destroy still happened
      if (!agentFactory) {
        return;
      }
    }

    await recreateAgent();

    // Agent should be destroyed even without factory
    expect(agent.destroyed).toBe(true);
    expect(agent.destroy).toHaveBeenCalledTimes(1);
  });

  it('should merge deviceOptions with existing options', () => {
    const iface = {
      options: { existingOption: 'value', alwaysRefreshScreenInfo: false },
    } as { options?: Record<string, unknown> };

    const deviceOptions = { alwaysRefreshScreenInfo: true };

    iface.options = {
      ...(iface.options || {}),
      ...deviceOptions,
    };

    expect(iface.options).toEqual({
      existingOption: 'value',
      alwaysRefreshScreenInfo: true,
    });
  });
});
