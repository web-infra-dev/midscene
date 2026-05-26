import type { PlaygroundSessionSetup } from '@midscene/playground';
import { buildSessionInitialValues } from './session-state';

function hasSessionFieldValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function resolveAutoCreateSessionInput(
  setup: PlaygroundSessionSetup | null,
  existingValues: Record<string, unknown> = {},
): Record<string, unknown> | null {
  if (!setup?.autoSubmitWhenReady) {
    return null;
  }

  const values = buildSessionInitialValues(setup, existingValues);

  for (const field of setup.fields) {
    if (!field.required) {
      continue;
    }

    if (!hasSessionFieldValue(values[field.key])) {
      return null;
    }
  }

  return values;
}
