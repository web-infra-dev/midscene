import type { TUserPrompt } from '@/ai-model';

/** Render user-provided AI guidance at the model prompt boundary. */
export const renderUserContext = (
  userContext: string | undefined,
): string | undefined => {
  const trimmedUserContext = userContext?.trim();
  if (trimmedUserContext) {
    return `<CONTEXT>\n${trimmedUserContext}\n</CONTEXT>`;
  }

  return userContext === undefined ? undefined : '';
};

// These tags, whitespace, and trimming rules are part of persisted cache keys.
// Preserve them for historical cache matching; do not reuse model prompt renderers,
// whose formatting may change independently.
export const buildPlanningCacheKey = (
  prompt: TUserPrompt,
  userContext: string | undefined,
): TUserPrompt => {
  const trimmedUserContext = userContext?.trim();
  if (!trimmedUserContext) {
    return prompt;
  }

  const promptText = typeof prompt === 'string' ? prompt : prompt.prompt;
  const cacheText = `<CONTEXT>\n${trimmedUserContext}\n</CONTEXT>\n\n${promptText}`;

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
  userContext: string | undefined,
): TUserPrompt {
  if (!prompt || !userContext) {
    return prompt;
  }
  const trimmedUserContext = userContext.trim();
  const text = typeof prompt === 'string' ? prompt : prompt.prompt;
  const cacheText = trimmedUserContext
    ? `<CONTEXT>\n${trimmedUserContext}\n</CONTEXT>\n\n<LOCATE_TARGET>\n${text}\n</LOCATE_TARGET>`
    : text;
  return typeof prompt === 'string'
    ? cacheText
    : { ...prompt, prompt: cacheText };
}

function renderLocateText(
  text: string,
  userContext: string | undefined,
): string {
  const rendered = renderUserContext(userContext);
  return rendered
    ? `${rendered}\n\n<LOCATE_TARGET>\n${text}\n</LOCATE_TARGET>`
    : text;
}

export function buildLocatePromptWithUserContext(
  prompt: TUserPrompt,
  userContext: string | undefined,
): Exclude<TUserPrompt, string> {
  const input = typeof prompt === 'string' ? { prompt } : prompt;
  return { ...input, prompt: renderLocateText(input.prompt, userContext) };
}
