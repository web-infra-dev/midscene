import { Agent } from '@/agent';
import { parseGherkinScenario } from '@/agent/run-gherkin-scenario';
import { describe, expect, it, rs } from '@rstest/core';

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).aiAct = rs.fn(async () => undefined);
  (agent as any).aiAssert = rs.fn(async () => undefined);
  return agent;
};

describe('runGherkinScenario', () => {
  it('runs an anonymous Gherkin scenario through aiAct and aiAssert', async () => {
    const agent = createAgentStub();

    await expect(
      agent.runGherkinScenario(`
Given the checkout page is open
And the cart is empty
When I add "Buy milk" to the cart
Then the cart should contain "Buy milk"
And the cart total should be visible
`),
    ).resolves.toBeUndefined();

    expect(agent.aiAct).toHaveBeenCalledTimes(3);
    expect(agent.aiAct).toHaveBeenNthCalledWith(
      1,
      'Set up this precondition: the checkout page is open',
      {
        cacheable: false,
      },
    );
    expect(agent.aiAct).toHaveBeenNthCalledWith(
      2,
      'Set up this precondition: the cart is empty',
      {
        cacheable: false,
      },
    );
    expect(agent.aiAct).toHaveBeenNthCalledWith(
      3,
      'Perform this user action: I add "Buy milk" to the cart',
      {
        cacheable: false,
      },
    );
    expect(agent.aiAssert).toHaveBeenCalledTimes(2);
    expect(agent.aiAssert).toHaveBeenNthCalledWith(
      1,
      'Verify that the cart should contain "Buy milk"',
    );
    expect(agent.aiAssert).toHaveBeenNthCalledWith(
      2,
      'Verify that the cart total should be visible',
    );
  });

  it('forwards context and abortSignal to aiAct and aiAssert options', async () => {
    const agent = createAgentStub();
    const abortController = new AbortController();

    await agent.runGherkinScenario(
      `
Given the todo app is open
Then the list should be empty
`,
      {
        context: 'Use the current user as a logged-in buyer.',
        abortSignal: abortController.signal,
        cacheable: false,
        deepThink: true,
      },
    );

    expect(agent.aiAct).toHaveBeenCalledWith(
      'Set up this precondition: the todo app is open',
      {
        context: 'Use the current user as a logged-in buyer.',
        abortSignal: abortController.signal,
        cacheable: false,
        deepThink: true,
      },
    );
    expect(agent.aiAssert).toHaveBeenCalledWith(
      'Verify that the list should be empty',
      undefined,
      {
        context: 'Use the current user as a logged-in buyer.',
        abortSignal: abortController.signal,
      },
    );
  });

  it('always disables aiAct cache inside a Gherkin scenario', async () => {
    const agent = createAgentStub();

    await agent.runGherkinScenario(
      `
Given the todo app is open
When I add "Buy milk"
`,
      {
        cacheable: true,
      },
    );

    expect(agent.aiAct).toHaveBeenNthCalledWith(
      1,
      'Set up this precondition: the todo app is open',
      {
        cacheable: false,
      },
    );
    expect(agent.aiAct).toHaveBeenNthCalledWith(
      2,
      'Perform this user action: I add "Buy milk"',
      {
        cacheable: false,
      },
    );
  });

  it('supports one Scenario', async () => {
    const agent = createAgentStub();

    await expect(
      agent.runGherkinScenario(`
Scenario: Add a todo item
  Given the todo app is open
  When I add "Buy milk"
  Then the list should contain "Buy milk"
`),
    ).resolves.toBeUndefined();

    expect(
      parseGherkinScenario(`
Scenario: Add a todo item
  Given the todo app is open
  When I add "Buy milk"
  Then the list should contain "Buy milk"
`).steps.map((step) => step.text),
    ).toEqual([
      'the todo app is open',
      'I add "Buy milk"',
      'the list should contain "Buy milk"',
    ]);
    expect(agent.aiAct).toHaveBeenCalledTimes(2);
    expect(agent.aiAssert).toHaveBeenCalledTimes(1);
  });

  it('throws when the input contains Feature', () => {
    expect(() =>
      parseGherkinScenario(`
Feature: Todo

Scenario: Add
  Given the todo app is open
`),
    ).toThrow('runGherkinScenario does not support "Feature: Todo" at line 2.');
  });

  it('throws when the input contains Background', () => {
    expect(() =>
      parseGherkinScenario(`
Background:
  Given the todo app is open

Scenario: Add
  When I add "Buy milk"
`),
    ).toThrow('runGherkinScenario does not support "Background:" at line 2.');
  });

  it('throws when the input contains multiple scenarios', () => {
    expect(() =>
      parseGherkinScenario(`
Scenario: Add
  Given the todo app is open

Scenario: Delete
  Given the todo app is open
`),
    ).toThrow('runGherkinScenario expects exactly one Scenario, but found 2.');
  });

  it('throws for unsupported Gherkin syntax', () => {
    expect(() =>
      parseGherkinScenario(`
Scenario Outline: Add todo
  Given the todo app is open

Examples:
  | name |
  | Buy milk |
`),
    ).toThrow(
      'runGherkinScenario does not support "Scenario Outline: Add todo" at line 2.',
    );
  });

  it('throws when And or But has no previous primary keyword', () => {
    expect(() =>
      parseGherkinScenario(`
And the todo app is open
`),
    ).toThrow(
      'runGherkinScenario cannot resolve "And" at line 2; use Given, When, or Then before And.',
    );
  });

  it('throws when an anonymous scenario starts with an unknown step keyword', () => {
    expect(() =>
      parseGherkinScenario(`
Givn the todo page is open
When I add "Buy milk"
Then the todo list contains "Buy milk"
`),
    ).toThrow(
      'runGherkinScenario does not support content at line 2: Givn the todo page is open',
    );
  });

  it('throws when a Scenario block starts with an unknown step keyword', () => {
    expect(() =>
      parseGherkinScenario(`
Scenario: Add a todo
Givn the todo page is open
When I add "Buy milk"
Then the todo list contains "Buy milk"
`),
    ).toThrow(
      'runGherkinScenario does not support content at line 3: Givn the todo page is open',
    );
  });

  it('wraps step execution errors with semantic action, line, and step context', async () => {
    const agent = createAgentStub();
    (agent as any).aiAssert = rs.fn(async () => {
      throw new Error('not visible');
    });

    await expect(
      agent.runGherkinScenario(`
Given the todo app is open
Then the list should be empty
`),
    ).rejects.toThrow(
      'runGherkinScenario failed while verifying the expected result (Then -> aiAssert) at line 3: Then the list should be empty',
    );
  });

  it('reports inherited And or But semantics in execution errors', async () => {
    const agent = createAgentStub();
    (agent as any).aiAssert = rs
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('not visible'));

    await expect(
      agent.runGherkinScenario(`
Given the todo app is open
Then the list should be empty
And the empty state should be visible
`),
    ).rejects.toThrow(
      'runGherkinScenario failed while verifying the expected result (And as Then -> aiAssert) at line 4: And the empty state should be visible',
    );
  });
});
