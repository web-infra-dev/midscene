import { describe, expect, it } from '@rstest/core';
import { Agent } from '../../src/agent/agent';
import { commonAgentTestRunnerNodeDefinitions } from '../../src/agent/test-runner-nodes';

describe('Agent Test Runner Node definitions', () => {
  it('exposes the complete common Agent capability set', () => {
    expect(Agent.getTestRunnerNodeDefinitions()).toBe(
      commonAgentTestRunnerNodeDefinitions,
    );
    expect(
      commonAgentTestRunnerNodeDefinitions.map((definition) => [
        definition.name,
        definition.stringInputKey,
      ]),
    ).toEqual([
      ['aiAct', 'prompt'],
      ['aiTap', 'prompt'],
      ['aiAssert', 'prompt'],
      ['aiBoolean', 'prompt'],
      ['aiNumber', 'prompt'],
      ['aiString', 'prompt'],
      ['aiAsk', 'prompt'],
      ['recordToReport', 'title'],
    ]);
  });

  it('preserves explicit empty context overrides for every AI node', async () => {
    for (const definition of commonAgentTestRunnerNodeDefinitions) {
      if (definition.name === 'recordToReport') continue;
      const calls: unknown[][] = [];
      const agent = {
        [definition.name]: async (...args: unknown[]) => {
          calls.push(args);
          return undefined;
        },
      };
      const input = definition.inputSchema.parse({
        prompt: 'Inspect the page',
        options: { context: '' },
      });
      await definition.execute(agent, input, {
        signal: new AbortController().signal,
      });
      const options = calls[0][definition.name === 'aiAssert' ? 2 : 1];
      expect(options).toEqual(expect.objectContaining({ context: '' }));
    }
  });

  it('keeps multimodal prompts and method options nested', () => {
    expect(
      commonAgentTestRunnerNodeDefinitions[0].inputSchema.safeParse({
        prompt: {
          prompt: 'Match the target',
          images: [{ name: 'target', url: './target.png' }],
        },
        options: { deepLocate: true },
      }).success,
    ).toBe(true);
    expect(
      commonAgentTestRunnerNodeDefinitions[0].inputSchema.safeParse({
        prompt: 'Match the target',
        images: [{ name: 'target', url: './target.png' }],
      }).success,
    ).toBe(false);
  });
});
