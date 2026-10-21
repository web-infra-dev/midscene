import type { TUserPrompt } from '@/ai-model';

/** Render user-provided AI guidance at the model prompt boundary. */
export const renderAIContext = (
  context: string | undefined,
): string | undefined => {
  const trimmedContext = context?.trim();
  if (trimmedContext) {
    return `<CONTEXT>\n${trimmedContext}\n</CONTEXT>`;
  }

  return context === undefined ? undefined : '';
};

export const buildPromptWithContext = (
  prompt: TUserPrompt,
  context: string | undefined,
): TUserPrompt => {
  const renderedContext = renderAIContext(context);
  if (!renderedContext) {
    return prompt;
  }

  const promptText = typeof prompt === 'string' ? prompt : prompt.prompt;
  const promptWithContext = `${renderedContext}\n\n${promptText}`;

  if (typeof prompt === 'string') {
    return promptWithContext;
  }

  return {
    ...prompt,
    prompt: promptWithContext,
  };
};

export const buildLocatePromptWithContext = (
  prompt: TUserPrompt,
  context: string | undefined,
): TUserPrompt => {
  const renderedContext = renderAIContext(context);
  if (!renderedContext) {
    return prompt;
  }

  const promptText = typeof prompt === 'string' ? prompt : prompt.prompt;
  const promptWithContext = `${renderedContext}\n\n<LOCATE_TARGET>\n${promptText}\n</LOCATE_TARGET>`;

  if (typeof prompt === 'string') {
    return promptWithContext;
  }

  return {
    ...prompt,
    prompt: promptWithContext,
  };
};
