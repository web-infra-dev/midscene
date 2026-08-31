import type { TUserPrompt } from '@/ai-model';

/**
 * Combine context layers from broadest to most specific while preserving the
 * distinction between an omitted context and an explicitly empty context.
 */
export const mergeAIContexts = (
  ...contexts: Array<string | undefined>
): string | undefined => {
  const definedContexts = contexts.filter(
    (context): context is string => context !== undefined,
  );
  if (definedContexts.length === 0) {
    return undefined;
  }

  return definedContexts.filter(Boolean).join('\n\n');
};

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

export const buildLocatePromptWithContext = (
  prompt: TUserPrompt,
  context: string | undefined,
): TUserPrompt => {
  const trimmedContext = context?.trim();
  if (!trimmedContext) {
    return prompt;
  }

  const promptText = typeof prompt === 'string' ? prompt : prompt.prompt;
  const promptWithContext = `<CONTEXT>\n${trimmedContext}\n</CONTEXT>\n\n<LOCATE_TARGET>\n${promptText}\n</LOCATE_TARGET>`;

  if (typeof prompt === 'string') {
    return promptWithContext;
  }

  return {
    ...prompt,
    prompt: promptWithContext,
  };
};
