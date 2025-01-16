import { systemPromptToTaskPlanning } from '@/ai-model/prompt/llm-planning';
import { describe, expect, it, test } from 'vitest';

describe('automation - computer', () => {
  it('should be able to generate prompt', async () => {
    const prompt = await systemPromptToTaskPlanning();
    console.log(prompt);
    expect(prompt).toBeDefined();
  });
});
test('inspect with quick answer', async () => {});
