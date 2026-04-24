import { beforeEach, describe, expect, test, vi } from 'vitest';

const connectMock = vi.fn();
const currentDevice = { connect: connectMock };
const getConnectedDevicesWithDetailsMock = vi.fn();
const findAvailablePortMock = vi.fn(async (port: number) => port);

vi.mock('@midscene/android', () => ({
  AndroidAgent: vi.fn().mockImplementation((device) => ({
    interface: {
      interfaceType: 'android',
      describe: () => 'Mock Android device',
      actionSpace: () => [],
    },
    destroy: vi.fn(),
    device,
  })),
  AndroidDevice: vi.fn().mockImplementation(() => currentDevice),
  getConnectedDevicesWithDetails: getConnectedDevicesWithDetailsMock,
}));

vi.mock('@midscene/shared/node', () => ({
  findAvailablePort: findAvailablePortMock,
}));

vi.mock('@midscene/playground', () => ({
  definePlaygroundPlatform: (descriptor: unknown) => descriptor,
  createScrcpyPreviewDescriptor: (
    custom: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
  ) => ({
    kind: 'scrcpy',
    custom,
    capabilities: [],
    ...overrides,
  }),
}));

describe('androidPlaygroundPlatform session manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConnectedDevicesWithDetailsMock.mockResolvedValue([
      {
        udid: 'SERIAL123',
        state: 'device',
        model: 'Pixel 8',
        resolution: '1080x2400',
        density: 420,
      },
    ]);
    connectMock.mockResolvedValue(undefined);
  });

  test('returns device setup fields and creates a connected session', async () => {
    const { androidPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await androidPlaygroundPlatform.prepare();
    const setup = await prepared.sessionManager?.getSetupSchema();

    expect(setup?.fields[0]).toMatchObject({
      key: 'deviceId',
      type: 'select',
      defaultValue: 'SERIAL123',
    });
    expect(setup?.autoSubmitWhenReady).toBe(true);
    expect(setup?.fields[0]?.options?.[0]?.description).toBe(
      'Pixel 8 · 1080x2400',
    );

    const created = await prepared.sessionManager?.createSession({
      deviceId: 'SERIAL123',
    });
    expect(created?.displayName).toBe('SERIAL123');
    expect(created?.metadata).toMatchObject({
      deviceId: 'SERIAL123',
    });
    expect(connectMock).toHaveBeenCalled();
  });

  test('surfaces adb discovery failures instead of returning empty targets', async () => {
    getConnectedDevicesWithDetailsMock
      .mockRejectedValueOnce(new Error('adb executable not found'))
      .mockRejectedValueOnce(new Error('adb executable not found'));

    const { androidPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await androidPlaygroundPlatform.prepare();

    await expect(prepared.sessionManager?.getSetupSchema()).rejects.toThrow(
      'adb executable not found',
    );
    await expect(prepared.sessionManager?.listTargets?.()).rejects.toThrow(
      'adb executable not found',
    );
  });
});
