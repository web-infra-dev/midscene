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

function renderLocateText(text: string, context: string | undefined): string {
  const rendered = renderAIContext(context);
  return rendered
    ? `${rendered}\n\n<LOCATE_TARGET>\n${text}\n</LOCATE_TARGET>`
    : text;
}

export function buildLocatePromptWithContext(
  prompt: TUserPrompt,
  context: string | undefined,
): Exclude<TUserPrompt, string> {
  const input = typeof prompt === 'string' ? { prompt } : prompt;
  return { ...input, prompt: renderLocateText(input.prompt, context) };
}

// Cache records distinguish string prompts from objects, including empty strings.
export function buildLocateCacheKey(
  prompt: TUserPrompt,
  context: string | undefined,
): TUserPrompt {
  if (!prompt || !context) {
    return prompt;
  }
  return typeof prompt === 'string'
    ? renderLocateText(prompt, context)
    : { ...prompt, prompt: renderLocateText(prompt.prompt, context) };
}
