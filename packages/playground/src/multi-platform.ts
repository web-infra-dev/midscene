import type {
  LaunchPlaygroundOptions,
  LaunchPlaygroundResult,
} from './launcher';
import type {
  PlaygroundCreatedSession,
  PlaygroundPlatformRegistration,
  PlaygroundSessionField,
  PlaygroundSessionFieldOption,
  PlaygroundSessionManager,
  PlaygroundSessionState,
  PreparedPlaygroundPlatform,
} from './platform';
import { launchPreparedPlaygroundPlatform } from './platform-launcher';

export interface RegisteredPlaygroundPlatform<TOptions = unknown> {
  id: string;
  label: string;
  description?: string;
  supportsStandalone?: boolean;
  unavailableReason?: string;
  metadata?: Record<string, unknown>;
  prepare: (options?: TOptions) => Promise<PreparedPlaygroundPlatform>;
  options?: TOptions;
}

export interface PrepareMultiPlatformPlaygroundOptions {
  platformId?: string;
  title?: string;
  description?: string;
  selectorFieldKey?: string;
  selectorVariant?: 'cards' | 'select';
  metadata?: Record<string, unknown>;
  launchOptions?: LaunchPlaygroundOptions;
}

interface ActivePlatformState {
  platformId?: string;
  sessionManager?: PlaygroundSessionManager;
}

function prefixFieldKey(platformId: string, key: string): string {
  return `${platformId}.${key}`;
}

function prefixField(
  platformId: string,
  field: PlaygroundSessionField,
): PlaygroundSessionField {
  return {
    ...field,
    key: prefixFieldKey(platformId, field.key),
  };
}

function mapPlatformOption(
  platform: RegisteredPlaygroundPlatform,
): PlaygroundSessionFieldOption {
  const descriptionParts = [platform.description];
  if (platform.unavailableReason) {
    descriptionParts.push(platform.unavailableReason);
  }

  return {
    label: platform.label,
    value: platform.id,
    description: descriptionParts.filter(Boolean).join(' · ') || undefined,
  };
}

function mapPlatformRegistration(
  platform: RegisteredPlaygroundPlatform,
): PlaygroundPlatformRegistration {
  return {
    id: platform.id,
    label: platform.label,
    description: platform.description,
    unavailableReason: platform.unavailableReason,
    supportsStandalone: platform.supportsStandalone,
    metadata: platform.metadata,
  };
}

function pickPrefixedInput(
  input: Record<string, unknown> | undefined,
  platformId: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const prefix = `${platformId}.`;

  Object.entries(input || {}).forEach(([key, value]) => {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value;
    }
  });

  return result;
}

function buildPlatformSelectorField(
  platforms: RegisteredPlaygroundPlatform[],
  selectorFieldKey: string,
): PlaygroundSessionField {
  return {
    key: selectorFieldKey,
    label: 'Platform',
    type: 'select',
    required: true,
    options: platforms.map(mapPlatformOption),
    placeholder: 'Select a platform',
  };
}

function normalizeChildSession(
  prepared: PreparedPlaygroundPlatform,
  created: PlaygroundCreatedSession,
): PlaygroundCreatedSession {
  return {
    ...created,
    platformId: created.platformId || prepared.platformId,
    title: created.title || prepared.title,
    platformDescription: created.platformDescription || prepared.description,
    preview: created.preview || prepared.preview,
    executionHooks: created.executionHooks || prepared.executionHooks,
    sidecars: created.sidecars || prepared.sidecars,
    metadata: {
      ...(prepared.metadata || {}),
      ...(created.metadata || {}),
    },
  };
}

function buildDirectPreparedSession(
  prepared: PreparedPlaygroundPlatform,
): PlaygroundCreatedSession {
  if (!prepared.agent && !prepared.agentFactory) {
    throw new Error(
      `Platform "${prepared.platformId}" does not expose a session manager or agent source`,
    );
  }

  return {
    agent: prepared.agent,
    agentFactory: prepared.agentFactory,
    displayName: prepared.title,
    metadata: {
      ...(prepared.metadata || {}),
    },
    platformId: prepared.platformId,
    title: prepared.title,
    platformDescription: prepared.description,
    preview: prepared.preview,
    executionHooks: prepared.executionHooks,
    sidecars: prepared.sidecars,
  };
}

export async function prepareMultiPlatformPlayground(
  platforms: RegisteredPlaygroundPlatform[],
  options: PrepareMultiPlatformPlaygroundOptions = {},
): Promise<PreparedPlaygroundPlatform> {
  const registryMap = new Map(
    platforms.map((platform) => [platform.id, platform]),
  );
  const preparedCache = new Map<string, PreparedPlaygroundPlatform>();
  const activePlatformState: ActivePlatformState = {};
  const selectorFieldKey = options.selectorFieldKey || 'platformId';
  const platformRegistry = platforms.map(mapPlatformRegistration);

  const getPreparedPlatform = async (platformId: string) => {
    const cached = preparedCache.get(platformId);
    if (cached) {
      return cached;
    }

    const registration = registryMap.get(platformId);
    if (!registration) {
      throw new Error(`Unknown platform: ${platformId}`);
    }
    if (registration.unavailableReason) {
      throw new Error(registration.unavailableReason);
    }

    const prepared = await registration.prepare(registration.options);
    preparedCache.set(platformId, prepared);
    return prepared;
  };

  const sessionManager: PlaygroundSessionManager = {
    async getSetupSchema(input?: Record<string, unknown>) {
      const platformId =
        typeof input?.[selectorFieldKey] === 'string'
          ? String(input[selectorFieldKey])
          : undefined;
      const baseField = buildPlatformSelectorField(platforms, selectorFieldKey);

      if (!platformId) {
        return {
          title: 'Choose a platform',
          description:
            'Select a platform first, then complete its connection fields.',
          primaryActionLabel: 'Continue',
          fields: [baseField],
          platformRegistry,
          platformSelector: {
            fieldKey: selectorFieldKey,
            variant: options.selectorVariant || 'cards',
          },
        };
      }

      const registration = registryMap.get(platformId);
      if (!registration) {
        return {
          title: 'Choose a platform',
          description: `Unknown platform: ${platformId}`,
          primaryActionLabel: 'Continue',
          fields: [baseField],
          platformRegistry,
          platformSelector: {
            fieldKey: selectorFieldKey,
            variant: options.selectorVariant || 'cards',
          },
        };
      }

      if (registration.unavailableReason) {
        return {
          title: `Platform unavailable: ${registration.label}`,
          description: registration.unavailableReason,
          primaryActionLabel: 'Create Agent',
          fields: [baseField],
          platformRegistry,
          platformSelector: {
            fieldKey: selectorFieldKey,
            variant: options.selectorVariant || 'cards',
          },
        };
      }

      const prepared = await getPreparedPlatform(platformId);
      const childSetup = prepared.sessionManager?.getSetupSchema
        ? await prepared.sessionManager.getSetupSchema(
            pickPrefixedInput(input, platformId),
          )
        : undefined;

      return {
        title: childSetup?.title || `Connect ${registration.label}`,
        description: childSetup?.description || registration.description,
        primaryActionLabel: childSetup?.primaryActionLabel || 'Create Agent',
        fields: [
          {
            ...baseField,
            defaultValue: platformId,
          },
          ...(childSetup?.fields || []).map((field: PlaygroundSessionField) =>
            prefixField(platformId, field),
          ),
        ],
        targets: childSetup?.targets,
        platformRegistry,
        platformSelector: {
          fieldKey: selectorFieldKey,
          variant: options.selectorVariant || 'cards',
        },
      };
    },
    async createSession(input?: Record<string, unknown>) {
      const platformId =
        typeof input?.[selectorFieldKey] === 'string'
          ? String(input[selectorFieldKey])
          : undefined;

      if (!platformId) {
        throw new Error(`${selectorFieldKey} is required`);
      }

      const prepared = await getPreparedPlatform(platformId);
      const childInput = pickPrefixedInput(input, platformId);
      activePlatformState.platformId = platformId;
      activePlatformState.sessionManager = prepared.sessionManager;

      if (prepared.sessionManager) {
        return normalizeChildSession(
          prepared,
          await prepared.sessionManager.createSession(childInput),
        );
      }

      return buildDirectPreparedSession(prepared);
    },
    async destroySession(session?: PlaygroundSessionState) {
      const platformId = activePlatformState.platformId;
      if (!platformId) {
        return;
      }

      const prepared = preparedCache.get(platformId);
      const childSessionManager =
        activePlatformState.sessionManager || prepared?.sessionManager;
      activePlatformState.platformId = undefined;
      activePlatformState.sessionManager = undefined;

      await childSessionManager?.destroySession?.(session);
    },
  };

  return {
    platformId: options.platformId || 'multi-platform',
    title: options.title || 'Midscene Playground',
    description:
      options.description ||
      'Unified playground for multiple registered platforms',
    sessionManager,
    launchOptions: options.launchOptions,
    metadata: {
      sessionConnected: false,
      setupState: 'required',
      availablePlatforms: platformRegistry.map((platform) => ({
        id: platform.id,
        label: platform.label,
        unavailableReason: platform.unavailableReason,
      })),
      ...(options.metadata || {}),
    },
  };
}

export function playgroundForPlatforms(
  platforms: RegisteredPlaygroundPlatform[],
  options: PrepareMultiPlatformPlaygroundOptions = {},
) {
  return {
    async launch(
      overrides: LaunchPlaygroundOptions = {},
    ): Promise<LaunchPlaygroundResult> {
      const prepared = await prepareMultiPlatformPlayground(platforms, options);
      return launchPreparedPlaygroundPlatform(prepared, overrides);
    },
  };
}
