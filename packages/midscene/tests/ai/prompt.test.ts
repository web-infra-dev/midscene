import path from 'node:path';
import { AiInspectElement } from '@/ai-model';
import { systemPromptToTaskPlanning } from '@/ai-model/prompt/planning';
import { describe, expect, it, test } from 'vitest';
import { getPageTestData } from './evaluate/test-suite/util';

describe('automation - computer', () => {
  it('should be able to generate prompt', async () => {
    const prompt = await systemPromptToTaskPlanning();
    console.log(prompt);
    expect(prompt).toBeDefined();
  });
});
test('inspect with quick answer', async () => {});
