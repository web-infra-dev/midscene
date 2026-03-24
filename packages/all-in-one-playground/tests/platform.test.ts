import { describe, expect, test, vi } from 'vitest';

vi.mock('@midscene/android-playground', () => ({
  androidPlaygroundPlatform: {
    prepare: vi.fn(),
  },
}));

vi.mock('@midscene/computer-playground', () => ({
  computerPlaygroundPlatform: {
    prepare: vi.fn(),
  },
}));

vi.mock('@midscene/harmony', () => ({
  harmonyPlaygroundPlatform: {
    prepare: vi.fn(),
  },
}));

vi.mock('@midscene/ios', () => ({
  iosPlaygroundPlatform: {
    prepare: vi.fn(),
  },
}));

vi.mock('@midscene/web', () => ({
  webPlaygroundPlatform: {
    prepare: vi.fn(),
  },
}));

vi.mock('@midscene/playground', () => ({
  definePlaygroundPlatform: (descriptor: unknown) => descriptor,
  createScreenshotPreviewDescriptor: (overrides?: Record<string, unknown>) => ({
    kind: 'screenshot',
    screenshotPath: '/screenshot',
    capabilities: [],
    ...(overrides || {}),
  }),
  prepareMultiPlatformPlayground: async (
    platforms: Array<{
      id: string;
      label: string;
      description?: string;
      unavailableReason?: string;
      prepare: () => Promise<any>;
    }>,
    options: Record<string, unknown> = {},
  ) => {
    const registryMap = new Map(
      platforms.map((platform) => [platform.id, platform]),
    );
    const preparedCache = new Map<string, any>();
    const activeState: { platformId?: string; sessionManager?: any } = {};
    const selectorFieldKey = String(options.selectorFieldKey || 'platformId');
    const platformRegistry = platforms.map((platform) => ({
      id: platform.id,
      label: platform.label,
      description: platform.description,
      unavailableReason: platform.unavailableReason,
    }));

    const getPreparedPlatform = async (platformId: string) => {
      const cached = preparedCache.get(platformId);
      if (cached) {
        return cached;
      }

      const registration = registryMap.get(platformId);
      if (!registration) {
        throw new Error(`Unknown platform: ${platformId}`);
      }

      const prepared = await registration.prepare();
      preparedCache.set(platformId, prepared);
      return prepared;
    };

    return {
      platformId: String(options.platformId || 'multi-platform'),
      title: String(options.title || 'Midscene Playground'),
      description: String(
        options.description ||
          'Unified playground for multiple registered platforms',
      ),
      sessionManager: {
        async getSetupSchema(input?: Record<string, unknown>) {
          const platformId =
            typeof input?.[selectorFieldKey] === 'string'
              ? String(input[selectorFieldKey])
              : undefined;
          const baseField = {
            key: selectorFieldKey,
            label: 'Platform',
            type: 'select',
            required: true,
            options: platforms.map((platform) => ({
              label: platform.label,
              value: platform.id,
              description:
                [platform.description, platform.unavailableReason]
                  .filter(Boolean)
                  .join(' · ') || undefined,
            })),
          };

          if (!platformId) {
            return {
              title: 'Choose a platform',
              fields: [baseField],
              platformRegistry,
              platformSelector: {
                fieldKey: selectorFieldKey,
                variant: options.selectorVariant || 'cards',
              },
            };
          }

          const prepared = await getPreparedPlatform(platformId);
          const childSetup = await prepared.sessionManager?.getSetupSchema?.(
            {},
          );
          return {
            title: childSetup?.title || `Connect ${platformId}`,
            fields: [
              {
                ...baseField,
                defaultValue: platformId,
              },
              ...((childSetup?.fields || []).map((field: any) => ({
                ...field,
                key: `${platformId}.${field.key}`,
              })) || []),
            ],
            platformRegistry,
            platformSelector: {
              fieldKey: selectorFieldKey,
              variant: options.selectorVariant || 'cards',
            },
          };
        },
        async createSession(input?: Record<string, unknown>) {
          const platformId = String(input?.[selectorFieldKey]);
          const prepared = await getPreparedPlatform(platformId);
          const childInput = Object.fromEntries(
            Object.entries(input || {})
              .filter(([key]) => key.startsWith(`${platformId}.`))
              .map(([key, value]) => [key.slice(platformId.length + 1), value]),
          );
          activeState.platformId = platformId;
          activeState.sessionManager = prepared.sessionManager;

          if (prepared.sessionManager) {
            const created =
              await prepared.sessionManager.createSession(childInput);
            return {
              ...created,
              platformId: created.platformId || prepared.platformId,
              title: created.title || prepared.title,
              platformDescription:
                created.platformDescription || prepared.description,
              preview: created.preview || prepared.preview,
              metadata: {
                ...(prepared.metadata || {}),
                ...(created.metadata || {}),
              },
            };
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
          };
        },
        async destroySession(session?: {
          connected: boolean;
          displayName?: string;
        }) {
          if (!activeState.platformId) {
            return;
          }

          await activeState.sessionManager?.destroySession?.(session);
          activeState.platformId = undefined;
          activeState.sessionManager = undefined;
        },
      },
    };
  },
}));

const { createAllInOnePlaygroundPlatform } = await import('../src/platform');

function createAgent(interfaceType: string) {
  return {
    interface: {
      interfaceType,
      describe: () => `${interfaceType} interface`,
      actionSpace: () => [],
    },
    destroy: vi.fn(),
  } as any;
}

describe('allInOnePlaygroundPlatform', () => {
  test('returns platform selector schema before a platform is chosen', async () => {
    const platform = createAllInOnePlaygroundPlatform();
    const prepared = await platform.prepare({
      platforms: [
        {
          id: 'android',
          label: 'Android',
          prepare: async () => ({
            platformId: 'android',
            title: 'Android',
            sessionManager: {
              async getSetupSchema() {
                return {
                  fields: [
                    {
                      key: 'deviceId',
                      label: 'Device',
                      type: 'select',
                    },
                  ],
                };
              },
              async createSession() {
                return {
                  agent: createAgent('android'),
                };
              },
            },
          }),
        },
        {
          id: 'web',
          label: 'Web',
          unavailableReason: 'Requires injected agent',
          prepare: async () => ({
            platformId: 'web',
            title: 'Web',
            agent: createAgent('web'),
          }),
        },
      ],
    });

    const setup = await prepared.sessionManager?.getSetupSchema();
    expect(setup).toMatchObject({
      title: 'Choose a platform',
      fields: [{ key: 'platformId', type: 'select' }],
      platformSelector: {
        fieldKey: 'platformId',
        variant: 'cards',
      },
      platformRegistry: [
        {
          id: 'android',
          label: 'Android',
        },
        {
          id: 'web',
          label: 'Web',
          unavailableReason: 'Requires injected agent',
        },
      ],
    });
    expect(setup?.fields[0].options).toMatchObject([
      { label: 'Android', value: 'android' },
      {
        label: 'Web',
        value: 'web',
        description: 'Requires injected agent',
      },
    ]);
  });

  test('returns child setup fields with platform-prefixed keys', async () => {
    const childGetSetupSchema = vi.fn(async () => ({
      title: 'Connect Android device',
      fields: [
        {
          key: 'deviceId',
          label: 'Device',
          type: 'select',
        },
      ],
    }));

    const platform = createAllInOnePlaygroundPlatform();
    const prepared = await platform.prepare({
      platforms: [
        {
          id: 'android',
          label: 'Android',
          prepare: async () => ({
            platformId: 'android',
            title: 'Android',
            sessionManager: {
              getSetupSchema: childGetSetupSchema,
              async createSession() {
                return {
                  agent: createAgent('android'),
                };
              },
            },
          }),
        },
      ],
    });

    const setup = await prepared.sessionManager?.getSetupSchema({
      platformId: 'android',
    });

    expect(childGetSetupSchema).toHaveBeenCalledWith({});
    expect(setup).toMatchObject({
      title: 'Connect Android device',
      platformSelector: {
        fieldKey: 'platformId',
        variant: 'cards',
      },
      fields: [
        { key: 'platformId', defaultValue: 'android' },
        { key: 'android.deviceId', label: 'Device' },
      ],
    });
  });

  test('routes createSession to child session manager and normalizes runtime fields', async () => {
    const createSession = vi.fn(async (input?: Record<string, unknown>) => ({
      agent: createAgent('android'),
      displayName: String(input?.deviceId),
      metadata: {
        deviceId: input?.deviceId,
      },
    }));
    const destroySession = vi.fn(async () => undefined);

    const platform = createAllInOnePlaygroundPlatform();
    const prepared = await platform.prepare({
      platforms: [
        {
          id: 'android',
          label: 'Android',
          prepare: async () => ({
            platformId: 'android',
            title: 'Android',
            description: 'Android descriptor',
            preview: {
              kind: 'scrcpy',
              title: 'Android preview',
              capabilities: [],
            },
            sessionManager: {
              async getSetupSchema() {
                return {
                  fields: [],
                };
              },
              createSession,
              destroySession,
            },
          }),
        },
      ],
    });

    const created = await prepared.sessionManager?.createSession({
      platformId: 'android',
      'android.deviceId': 'SERIAL123',
    });

    expect(createSession).toHaveBeenCalledWith({
      deviceId: 'SERIAL123',
    });
    expect(created).toMatchObject({
      displayName: 'SERIAL123',
      platformId: 'android',
      title: 'Android',
      platformDescription: 'Android descriptor',
      preview: {
        kind: 'screenshot',
        title: 'Android preview',
      },
      metadata: {
        deviceId: 'SERIAL123',
      },
    });

    await prepared.sessionManager?.destroySession({
      connected: true,
      displayName: 'SERIAL123',
    });
    expect(destroySession).toHaveBeenCalled();
  });

  test('supports direct agent platforms without a child session manager', async () => {
    const platform = createAllInOnePlaygroundPlatform();
    const prepared = await platform.prepare({
      platforms: [
        {
          id: 'web',
          label: 'Web',
          prepare: async () => ({
            platformId: 'web',
            title: 'Web Playground',
            description: 'Web descriptor',
            agentFactory: async () => createAgent('web'),
            preview: {
              kind: 'screenshot',
              title: 'Web page preview',
              capabilities: [],
            },
          }),
        },
      ],
    });

    const created = await prepared.sessionManager?.createSession({
      platformId: 'web',
    });

    expect(created).toMatchObject({
      title: 'Web Playground',
      platformId: 'web',
      platformDescription: 'Web descriptor',
      preview: {
        kind: 'screenshot',
        title: 'Web page preview',
      },
    });
    expect(created?.agentFactory).toBeTypeOf('function');
  });
});
