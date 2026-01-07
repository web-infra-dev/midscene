import { describe, expect, it } from 'vitest';
import { ComputerAgent, ComputerDevice } from '../../src';

describe('ComputerAgent', () => {
  it('should create agent instance', () => {
    const device = new ComputerDevice({});
    const agent = new ComputerAgent(device);

    expect(agent).toBeDefined();
    expect(agent.interface).toBe(device);
  });

  it('should create agent with options', () => {
    const device = new ComputerDevice({ displayId: 'test' });
    const agent = new ComputerAgent(device, {
      aiActionContext: 'Test context',
    });

    expect(agent).toBeDefined();
  });

  it('should create agent with custom actions', () => {
    const device = new ComputerDevice({
      customActions: [],
    });
    const agent = new ComputerAgent(device);

    expect(agent).toBeDefined();
    expect(agent.interface).toBeDefined();
  });

  // Note: Tests that require actual libnut functionality (like agentFromDesktop with connect)
  // should be run as AI tests or integration tests where native modules are available
});
