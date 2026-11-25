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

// These tags, whitespace, and trimming rules are part of persisted cache keys.
// Preserve them for historical cache matching; do not reuse model prompt renderers,
// whose formatting may change independently.
export const buildPlanningCacheKey = (
  prompt: TUserPrompt,
  context: string | undefined,
): TUserPrompt => {
  const trimmedContext = context?.trim();
  if (!trimmedContext) {
    return prompt;
  }

  const promptText = typeof prompt === 'string' ? prompt : prompt.prompt;
  const cacheText = `<CONTEXT>\n${trimmedContext}\n</CONTEXT>\n\n${promptText}`;

  if (typeof prompt === 'string') {
    return cacheText;
  }

  return {
    ...prompt,
    prompt: cacheText,
  };
};

// Tags, whitespace, trimming, and string/object distinctions affect historical
// cache matching. Preserve this format independently of model prompt templates.
export function buildLocateCacheKey(
  prompt: TUserPrompt,
  context: string | undefined,
): TUserPrompt {
  if (!prompt || !context) {
    return prompt;
  }
  const trimmedContext = context.trim();
  const text = typeof prompt === 'string' ? prompt : prompt.prompt;
  const cacheText = trimmedContext
    ? `<CONTEXT>\n${trimmedContext}\n</CONTEXT>\n\n<LOCATE_TARGET>\n${text}\n</LOCATE_TARGET>`
    : text;
  return typeof prompt === 'string'
    ? cacheText
    : { ...prompt, prompt: cacheText };
}

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
