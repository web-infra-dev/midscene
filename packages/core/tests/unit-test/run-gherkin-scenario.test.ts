import { Agent } from '@/agent';
import { parseGherkinScenario } from '@/agent/run-gherkin-scenario';
import { describe, expect, it, vi } from 'vitest';

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).aiAct = vi.fn(async () => undefined);
  (agent as any).aiAssert = vi.fn(async () => undefined);
  return agent;
};

describe('runGherkinScenario', () => {
  it('runs an anonymous Gherkin scenario through aiAct and aiAssert', async () => {
    const agent = createAgentStub();

    const result = await agent.runGherkinScenario(`
Given the checkout page is open
And the cart is empty
When I add "Buy milk" to the cart
Then the cart should contain "Buy milk"
And the cart total should be visible
`);

    expect(agent.aiAct).toHaveBeenCalledTimes(3);
    expect(agent.aiAct).toHaveBeenNthCalledWith(
      1,
      'Set up this precondition: the checkout page is open',
    );
    expect(agent.aiAct).toHaveBeenNthCalledWith(
      2,
      'Set up this precondition: the cart is empty',
    );
    expect(agent.aiAct).toHaveBeenNthCalledWith(
      3,
      'Perform this user action: I add "Buy milk" to the cart',
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
    expect(result).toEqual({
      scenario: undefined,
      steps: [
        {
          keyword: 'Given',
          text: 'the checkout page is open',
          action: 'aiAct',
          status: 'passed',
        },
        {
          keyword: 'And',
          text: 'the cart is empty',
          action: 'aiAct',
          status: 'passed',
        },
        {
          keyword: 'When',
          text: 'I add "Buy milk" to the cart',
          action: 'aiAct',
          status: 'passed',
        },
        {
          keyword: 'Then',
          text: 'the cart should contain "Buy milk"',
          action: 'aiAssert',
          status: 'passed',
        },
        {
          keyword: 'And',
          text: 'the cart total should be visible',
          action: 'aiAssert',
          status: 'passed',
        },
      ],
    });
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

  it('supports one Scenario', async () => {
    const agent = createAgentStub();

    const result = await agent.runGherkinScenario(`
Scenario: Add a todo item
  Given the todo app is open
  When I add "Buy milk"
  Then the list should contain "Buy milk"
`);

    expect(result.scenario).toBe('Add a todo item');
    expect(result.steps.map((step) => step.text)).toEqual([
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

  it('wraps step execution errors with line and step context', async () => {
    const agent = createAgentStub();
    (agent as any).aiAssert = vi.fn(async () => {
      throw new Error('not visible');
    });

    await expect(
      agent.runGherkinScenario(`
Given the todo app is open
Then the list should be empty
`),
    ).rejects.toThrow(
      'runGherkinScenario failed at line 3: Then the list should be empty',
    );
  });
});
