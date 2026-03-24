import type {
  PlaygroundRuntimeInfo,
  PlaygroundSessionSetup,
} from '@midscene/playground';

export interface PlaygroundSessionViewState {
  connected: boolean;
  displayName?: string;
  setupState: 'required' | 'ready' | 'blocked';
  setupBlockingReason?: string;
}

export function resolveSessionViewState(
  runtimeInfo: PlaygroundRuntimeInfo | null,
): PlaygroundSessionViewState {
  const metadata = runtimeInfo?.metadata || {};
  const rawSetupState = metadata.setupState;
  const setupState =
    rawSetupState === 'blocked' ||
    rawSetupState === 'ready' ||
    rawSetupState === 'required'
      ? rawSetupState
      : 'ready';

  return {
    connected: Boolean(metadata.sessionConnected),
    displayName:
      typeof metadata.sessionDisplayName === 'string'
        ? metadata.sessionDisplayName
        : undefined,
    setupState,
    setupBlockingReason:
      typeof metadata.setupBlockingReason === 'string'
        ? metadata.setupBlockingReason
        : undefined,
  };
}

export function buildSessionInitialValues(
  setup: PlaygroundSessionSetup | null,
  existingValues: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!setup) {
    return {};
  }

  return Object.fromEntries(
    setup.fields.map((field) => [
      field.key,
      existingValues[field.key] ?? field.defaultValue ?? '',
    ]),
  );
}
