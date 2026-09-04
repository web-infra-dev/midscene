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
