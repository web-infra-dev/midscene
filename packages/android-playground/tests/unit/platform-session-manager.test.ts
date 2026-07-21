import { beforeEach, describe, expect, test, vi } from 'vitest';

const connectMock = vi.fn();
const currentDevice = { connect: connectMock };
const getConnectedDevicesWithDetailsMock = vi.fn();
const findAvailablePortMock = vi.fn(async (port: number) => port);
const androidAgentMock = vi.fn().mockImplementation((device) => ({
  interface: {
    interfaceType: 'android',
    describe: () => 'Mock Android device',
    actionSpace: () => [],
  },
  destroy: vi.fn(),
  device,
}));

vi.mock('@midscene/android', () => ({
  AndroidAgent: androidAgentMock,
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
    const prepared = await androidPlaygroundPlatform.prepare({});
    const setup = await prepared.sessionManager!.getSetupSchema!();

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

  test('passes agent options to the initial and follow-up agents', async () => {
    const { androidPlaygroundPlatform } = await import('../../src/platform');
    const agentOptions = {
      aiActContext: 'Prefer visible controls',
      waitAfterAction: 250,
    };
    const prepared = await androidPlaygroundPlatform.prepare({ agentOptions });
    const created = await prepared.sessionManager?.createSession({
      deviceId: 'SERIAL123',
    });

    await created?.agentFactory?.();

    expect(androidAgentMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      agentOptions,
    );
    expect(androidAgentMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      agentOptions,
    );
  });

  test('keeps the setup schema usable when adb discovery fails', async () => {
    getConnectedDevicesWithDetailsMock
      .mockRejectedValueOnce(new Error('adb executable not found'))
      .mockRejectedValueOnce(new Error('adb executable not found'));

    const { androidPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await androidPlaygroundPlatform.prepare({});

    const setup = await prepared.sessionManager!.getSetupSchema!();
    expect(setup?.targets).toEqual([]);
    expect(setup?.autoSubmitWhenReady).toBe(false);
    expect(setup?.notice).toMatchObject({
      type: 'warning',
      description: expect.stringContaining('adb executable not found'),
    });

    await expect(prepared.sessionManager?.listTargets?.()).resolves.toEqual([]);
  });

  test('bubbles adb discovery failures out of createSession so the user sees the root cause', async () => {
    getConnectedDevicesWithDetailsMock.mockRejectedValueOnce(
      new Error('adb executable not found'),
    );

    const { androidPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await androidPlaygroundPlatform.prepare({});

    await expect(prepared.sessionManager?.createSession({})).rejects.toThrow(
      'adb executable not found',
    );
  });
});
