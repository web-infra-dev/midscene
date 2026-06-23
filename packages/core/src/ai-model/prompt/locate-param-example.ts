import type { LocateResultPromptSpec } from '../shared/model-locate-result';

export function formatLocateExampleValue(value: unknown): string {
  return Array.isArray(value) ? `[${value.join(', ')}]` : JSON.stringify(value);
}

export function locateParamExample(
  prompt: string,
  promptSpec?: LocateResultPromptSpec,
  exampleValue?: unknown,
): string {
  if (!promptSpec) {
    return `{
    "prompt": ${JSON.stringify(prompt)}
  }`;
  }

  return `{
    "prompt": ${JSON.stringify(prompt)},
    "${promptSpec.resultKey}": ${formatLocateExampleValue(
      exampleValue ?? promptSpec.exampleValues[0],
    )}
  }`;
}
