import {
  type AgentBehaviorInitArgs,
  agentBehaviorInitArgShape,
} from '@midscene/shared/agent-tools';

const STUDIO_AGENT_OPTION_KEYS = [
  'aiActContext',
  'replanningCycleLimit',
  'screenshotShrinkFactor',
  'waitAfterAction',
] as const;

type StudioAgentOptionKey = (typeof STUDIO_AGENT_OPTION_KEYS)[number];

export type StudioAgentOptionsV1 = Pick<
  AgentBehaviorInitArgs,
  StudioAgentOptionKey
>;

export type StudioResolvedAgentOptionsV1 = StudioAgentOptionsV1;

export interface StudioRuntimeSettingsV1 {
  schemaVersion: 1;
  agentOptions: StudioAgentOptionsV1;
}

const SETTINGS_KEYS = new Set(['schemaVersion', 'agentOptions']);
const AGENT_OPTION_KEYS = new Set<string>(STUDIO_AGENT_OPTION_KEYS);
const STUDIO_AGENT_OPTION_SHAPE = {
  aiActContext: agentBehaviorInitArgShape.aiActContext,
  replanningCycleLimit: agentBehaviorInitArgShape.replanningCycleLimit,
  screenshotShrinkFactor: agentBehaviorInitArgShape.screenshotShrinkFactor,
  waitAfterAction: agentBehaviorInitArgShape.waitAfterAction,
};

export const EMPTY_STUDIO_RUNTIME_SETTINGS: Readonly<StudioRuntimeSettingsV1> =
  Object.freeze({
    schemaVersion: 1,
    agentOptions: Object.freeze({}),
  });

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) {
    throw new Error(`${label} contains unknown key: ${unknownKey}`);
  }
}

function normalizeAgentOptions(input: unknown): StudioAgentOptionsV1 {
  if (input === undefined) return {};
  assertPlainObject(input, 'agentOptions');
  assertKnownKeys(input, AGENT_OPTION_KEYS, 'agentOptions');

  const normalized: Record<string, unknown> = {};
  for (const key of STUDIO_AGENT_OPTION_KEYS) {
    const value = input[key];
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`agentOptions.${key} must be JSON-serializable`);
    }
    const parsed = STUDIO_AGENT_OPTION_SHAPE[key].safeParse(value);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'is invalid';
      throw new Error(`agentOptions.${key}: ${message}`);
    }
    if (parsed.data !== undefined) {
      normalized[key] = parsed.data;
    }
  }
  return normalized as StudioAgentOptionsV1;
}

export function normalizeStudioRuntimeSettings(
  input: unknown,
): StudioRuntimeSettingsV1 {
  if (input === undefined) {
    return { schemaVersion: 1, agentOptions: {} };
  }

  assertPlainObject(input, 'settings');
  assertKnownKeys(input, SETTINGS_KEYS, 'settings');
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
    throw new Error('settings.schemaVersion must be 1');
  }

  return {
    schemaVersion: 1,
    agentOptions: normalizeAgentOptions(input.agentOptions),
  };
}

export function resolveStudioAgentOptions(
  settings: Readonly<StudioRuntimeSettingsV1>,
): StudioResolvedAgentOptionsV1 {
  return { ...settings.agentOptions };
}

export function serializeStudioRuntimeSettings(
  settings: Readonly<StudioRuntimeSettingsV1>,
): string {
  return JSON.stringify(normalizeStudioRuntimeSettings(settings));
}
