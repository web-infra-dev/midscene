import { systemPromptToTaskPlanning } from '@/ai-model/prompt/llm-planning';
import { describe, expect, it } from 'vitest';

describe('automation - computer', () => {
  it('should be able to generate prompt', async () => {
    const prompt = await systemPromptToTaskPlanning();
    expect(prompt).toBeDefined();
    expect(prompt).toMatchSnapshot();
  });
});
