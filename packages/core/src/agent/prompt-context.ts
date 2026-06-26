import type { TUserPrompt } from '@/ai-model';

export const buildPromptWithContext = (
  prompt: TUserPrompt,
  context: string | undefined,
): TUserPrompt => {
  const trimmedContext = context?.trim();
  if (!trimmedContext) {
    return prompt;
  }

  const promptText = typeof prompt === 'string' ? prompt : prompt.prompt;
  const promptWithContext = `Context for this request:\n${trimmedContext}\n\n${promptText}`;

  if (typeof prompt === 'string') {
    return promptWithContext;
  }

  return {
    ...prompt,
    prompt: promptWithContext,
  };
};
