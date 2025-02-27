import { systemPromptToAssert } from '@/ai-model/prompt/assertion';
import { describe, expect, it, vi } from 'vitest';

describe('Assertion prompt', () => {
  it('return default when it is not UI-Tars', () => {
    const prompt = systemPromptToAssert({ isUITars: false });
    expect(prompt).toMatchSnapshot();
  });

  it('return UI-Tars specific when it is UI-Tars', () => {
    vi.mock('@/ai-model/prompt/ui-tars-planning', () => ({
      getTimeZoneInfo: vi.fn().mockReturnValue({ isChina: false }),
    }));

    const prompt = systemPromptToAssert({ isUITars: true });

    expect(prompt).toMatchSnapshot();
  });
});
