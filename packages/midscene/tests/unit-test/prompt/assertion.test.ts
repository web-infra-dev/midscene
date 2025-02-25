import { systemPromptToAssert } from '@/ai-model/prompt/assertion';
import { describe, expect, it, vi } from 'vitest';

describe('Assertion prompt', () => {
  it('return default when it is not UI-Tars', () => {
    const prompt = systemPromptToAssert({ isUITars: false });
    expect(
      prompt,
    ).toEqual(`You are a senior testing engineer. User will give an assertion and a screenshot of a page. Please tell whether the assertion is truthy.

Return in the following JSON format:
{
  pass: boolean, // whether the assertion is truthy
  thought: string | null, // string, if the result is falsy, give the reason why it is falsy. Otherwise, put null.
}`);
  });

  it('return UI-Tars specific when it is UI-Tars', () => {
    vi.mock('@/ai-model/prompt/ui-tars-planning', () => ({
      getTimeZoneInfo: vi.fn().mockReturnValue({ isChina: false }),
    }));

    const prompt = systemPromptToAssert({ isUITars: true });

    expect(
      prompt,
    ).toEqual(`You are a senior testing engineer. User will give an assertion and a screenshot of a page. Please tell whether the assertion is truthy.

## Output Json String Format
\`\`\`
"{
  "pass": <<is a boolean value from the enum [true, false], true means the assertion is truthy>>, 
  "thought": "<<is a string, give the reason why the assertion is falsy or truthy. Otherwise.>>"
}"
\`\`\`

## Rules **MUST** follow
- Make sure to return **only** the JSON, with **no additional** text or explanations.
- Use English in \`thought\` part.
- You **MUST** strictly follow up the **Output Json String Format**.`);
  });
});
