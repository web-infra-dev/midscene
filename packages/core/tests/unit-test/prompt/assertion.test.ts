import { systemPromptToAssert } from '@/ai-model/prompt/assertion';
import { describe, expect, it, vi } from 'vitest';

describe('Assertion prompt', () => {
  vi.mock('@midscene/shared/env', () => ({
    getPreferredLanguage: vi.fn().mockReturnValue('English'),
  }));

  it('return default when it is not UI-Tars', () => {
    const prompt = systemPromptToAssert({ isUITars: false });
    expect(prompt).toMatchSnapshot();
  });

  it('return UI-Tars specific when it is UI-Tars', () => {
    const prompt = systemPromptToAssert({ isUITars: true });
    expect(prompt).toMatchSnapshot();
  });
});
