import { beforeEach, describe, expect, rs, test } from '@rstest/core';

const checkAccessibilityPermissionMock = rs.fn();
const checkScreenRecordingPermissionMock = rs.fn();
const getConnectedDisplaysMock = rs.fn();
const agentFromComputerMock = rs.fn();
const findAvailablePortMock = rs.fn(async (port: number) => port);

rs.mock('@midscene/computer', () => ({
  agentFromComputer: agentFromComputerMock,
  checkAccessibilityPermission: checkAccessibilityPermissionMock,
  checkScreenRecordingPermission: checkScreenRecordingPermissionMock,
  getConnectedDisplays: getConnectedDisplaysMock,
}));

rs.mock('@midscene/shared/node', () => ({
  findAvailablePort: findAvailablePortMock,
}));

rs.mock('@midscene/playground', () => ({
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
    rs.clearAllMocks();
    checkScreenRecordingPermissionMock.mockReturnValue({
      hasPermission: true,
    });
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
    const prepared = await computerPlaygroundPlatform.prepare({});

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
    const prepared = await computerPlaygroundPlatform.prepare({});

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
        screenshotBase64: rs.fn(async () => 'screenshot'),
      },
      destroy: rs.fn(),
    });

    const { computerPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await computerPlaygroundPlatform.prepare({});
    const setup = await prepared.sessionManager!.getSetupSchema!();

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
