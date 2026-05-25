import { beforeEach, describe, expect, test, vi } from 'vitest';

const checkAccessibilityPermissionMock = vi.fn();
const checkScreenRecordingPermissionMock = vi.fn();
const getConnectedDisplaysMock = vi.fn();
const agentFromComputerMock = vi.fn();
const findAvailablePortMock = vi.fn(async (port: number) => port);
const computerNativeEventRecorderMock = vi.fn();

vi.mock('@midscene/computer', () => ({
  ComputerNativeEventRecorder: computerNativeEventRecorderMock,
  agentFromComputer: agentFromComputerMock,
  checkAccessibilityPermission: checkAccessibilityPermissionMock,
  checkScreenRecordingPermission: checkScreenRecordingPermissionMock,
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
    checkScreenRecordingPermissionMock.mockReturnValue({
      hasPermission: true,
    });
    computerNativeEventRecorderMock.mockImplementation(() => ({
      getCapabilities: () => ({
        supported: true,
        source: 'computer-native',
        platformId: 'computer',
      }),
      start: vi.fn(async () => ({
        ok: true,
        supported: true,
        source: 'computer-native',
        platformId: 'computer',
      })),
      stop: vi.fn(async () => {}),
      getEvents: vi.fn(async () => ({ events: [], nextIndex: 0 })),
    }));
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

  test('reports blocked setup state when screen recording permission is missing', async () => {
    checkAccessibilityPermissionMock.mockReturnValue({
      hasPermission: true,
    });
    checkScreenRecordingPermissionMock.mockReturnValue({
      hasPermission: false,
      error: 'Screen Recording permission is required',
    });

    const { computerPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await computerPlaygroundPlatform.prepare();

    expect(prepared.metadata).toMatchObject({
      setupState: 'blocked',
      setupBlockingReason: 'Screen Recording permission is required',
    });

    await expect(
      prepared.sessionManager?.createSession({ displayId: '1' }),
    ).rejects.toThrow(/Screen Recording permission is required/);
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
        screenshotBase64: vi.fn(async () => 'screenshot'),
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
    expect(created?.recorderSource).toBeTruthy();
    expect(computerNativeEventRecorderMock).toHaveBeenCalledWith({
      displayId: 1,
      displayName: 'Primary display',
      screenshot: expect.any(Function),
    });
  });
});
