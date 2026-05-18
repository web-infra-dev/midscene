const normalizeContextText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }

  try {
    return JSON.stringify(value, undefined, 2);
  } catch {
    return String(value);
  }
};

export const buildDisplayedActContext = (
  aiActContext: unknown,
  extraPlanningContext: unknown,
): string | undefined => {
  const baseContext = normalizeContextText(aiActContext);
  const extraContext = normalizeContextText(extraPlanningContext);

  if (!baseContext) {
    return extraContext;
  }

  if (!extraContext || baseContext.includes(extraContext)) {
    return baseContext;
  }

  const separator =
    baseContext.endsWith('\n') || extraContext.startsWith('\n') ? '' : '\n';

  return `${baseContext}${separator}${extraContext}`;
};
