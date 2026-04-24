import { beforeEach, describe, expect, test, vi } from 'vitest';

const checkAccessibilityPermissionMock = vi.fn();
const getConnectedDisplaysMock = vi.fn();
const agentFromComputerMock = vi.fn();
const findAvailablePortMock = vi.fn(async (port: number) => port);

vi.mock('@midscene/computer', () => ({
  agentFromComputer: agentFromComputerMock,
  checkAccessibilityPermission: checkAccessibilityPermissionMock,
  getConnectedDisplays: getConnectedDisplaysMock,
}));

vi.mock('@midscene/shared/node', () => ({
  findAvailablePort: findAvailablePortMock,
}));

vi.mock('@midscene/playground', () => ({
  definePlaygroundPlatform: (descriptor: unknown) => descriptor,
  createScreenshotPreviewDescriptor: (
    overrides: Record<string, unknown> = {},
  ) => ({
    kind: 'screenshot',
    capabilities: [],
    ...overrides,
  }),
}));

describe('computerPlaygroundPlatform session manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConnectedDisplaysMock.mockResolvedValue([
      {
        id: 1,
        name: 'Primary display',
        primary: true,
        width: 1440,
        height: 900,
      },
    ]);
  });

  test('reports blocked setup state when accessibility permission is missing', async () => {
    checkAccessibilityPermissionMock.mockReturnValue({
      hasPermission: false,
      error: 'Accessibility permission is required',
    });

    const { computerPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await computerPlaygroundPlatform.prepare();

    expect(prepared.metadata).toMatchObject({
      setupState: 'blocked',
      setupBlockingReason: 'Accessibility permission is required',
    });
  });

  test('creates a display-backed session when permission is available', async () => {
    checkAccessibilityPermissionMock.mockReturnValue({
      hasPermission: true,
    });
    agentFromComputerMock.mockResolvedValue({
      interface: {
        interfaceType: 'computer',
        describe: () => 'Desktop',
        actionSpace: () => [],
      },
      destroy: vi.fn(),
    });

    const { computerPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await computerPlaygroundPlatform.prepare();
    const setup = await prepared.sessionManager?.getSetupSchema();

    expect(setup?.fields[0]).toMatchObject({
      key: 'displayId',
      defaultValue: '1',
    });

    const created = await prepared.sessionManager?.createSession({
      displayId: '1',
    });
    expect(created?.displayName).toBe('Primary display');
    expect(created?.metadata).toMatchObject({
      displayId: 1,
      executionUx: 'countdown-before-run',
    });
  });
});
