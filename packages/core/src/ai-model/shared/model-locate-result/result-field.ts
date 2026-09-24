import type { LocateResultPromptSpec } from './types';

export function locateResultKeys({
  resultKey,
  resultKeyAliases = [],
}: LocateResultPromptSpec): string[] {
  return [resultKey, ...resultKeyAliases];
}

/** An explicit null or empty array takes precedence over any fallback field. */
export function readLocateResultField(
  record: Record<string, unknown>,
  promptSpec: LocateResultPromptSpec,
  prefix = '',
): unknown {
  const key = locateResultKeys(promptSpec)
    .map((key) => `${prefix}${key}`)
    .find((key) => record[key] !== undefined);
  return key === undefined ? undefined : record[key];
}
