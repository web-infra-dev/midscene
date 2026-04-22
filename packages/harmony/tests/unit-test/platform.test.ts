import { beforeEach, describe, expect, test, vi } from 'vitest';

const connectMock = vi.fn();
const getConnectedDevicesMock = vi.fn();
const findAvailablePortMock = vi.fn(async () => 5810);

vi.mock('@midscene/playground', () => ({
  createScreenshotPreviewDescriptor: (overrides = {}) => ({
    kind: 'screenshot',
    screenshotPath: '/screenshot',
    ...overrides,
  }),
  definePlaygroundPlatform: (descriptor: unknown) => descriptor,
}));

vi.mock('@midscene/shared/node', () => ({
  findAvailablePort: findAvailablePortMock,
}));

vi.mock('../../src/agent', () => ({
  HarmonyAgent: vi.fn().mockImplementation((device) => ({
    device,
    interface: {
      interfaceType: 'harmony',
      actionSpace: () => [],
      describe: () => 'Mock Harmony device',
    },
  })),
}));

vi.mock('../../src/device', () => ({
  HarmonyDevice: vi.fn().mockImplementation(() => ({
    connect: connectMock,
  })),
}));

vi.mock('../../src/utils', () => ({
  getConnectedDevices: getConnectedDevicesMock,
}));

describe('harmonyPlaygroundPlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConnectedDevicesMock.mockResolvedValue([{ deviceId: 'SERIAL123' }]);
    connectMock.mockResolvedValue(undefined);
    findAvailablePortMock.mockResolvedValue(5810);
  });

  test('prepare returns typed launch options when a device id is provided', async () => {
    const { harmonyPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await harmonyPlaygroundPlatform.prepare({
      deviceId: 'SERIAL123',
      staticDir: '/tmp/harmony-static',
    });

    expect(prepared.platformId).toBe('harmony');
    expect(prepared.metadata).toMatchObject({
      deviceId: 'SERIAL123',
    });
    expect(prepared.sessionManager).toBeUndefined();
    expect(prepared.launchOptions).toMatchObject({
      port: 5810,
      staticPath: '/tmp/harmony-static',
      openBrowser: false,
      verbose: false,
    });
    expect(prepared.preview).toMatchObject({
      kind: 'screenshot',
    });
  });

  test('deferred mode returns setup fields and creates a connected session', async () => {
    const { harmonyPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await harmonyPlaygroundPlatform.prepare({
      staticDir: '/tmp/harmony-static',
      deferConnection: true,
    });
    const setup = await prepared.sessionManager?.getSetupSchema();

    expect(prepared.metadata).toMatchObject({
      sessionConnected: false,
      setupState: 'required',
    });
    expect(setup?.fields[0]).toMatchObject({
      key: 'deviceId',
      type: 'select',
      defaultValue: 'SERIAL123',
    });
    expect(setup?.autoSubmitWhenReady).toBe(true);

    const created = await prepared.sessionManager?.createSession({
      deviceId: 'SERIAL123',
    });

    expect(created?.displayName).toBe('SERIAL123');
    expect(created?.metadata).toMatchObject({
      deviceId: 'SERIAL123',
    });
    expect(connectMock).toHaveBeenCalled();
  });

  test('keeps deferred setup usable when no HarmonyOS devices are connected', async () => {
    getConnectedDevicesMock.mockResolvedValue([]);

    const { harmonyPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await harmonyPlaygroundPlatform.prepare({
      deferConnection: true,
    });

    const setup = await prepared.sessionManager?.getSetupSchema();

    expect(setup?.targets).toEqual([]);
    expect(setup?.autoSubmitWhenReady).toBe(false);
    expect(setup?.notice).toMatchObject({
      type: 'warning',
      description: expect.stringContaining('No HarmonyOS devices found'),
    });
    await expect(prepared.sessionManager?.listTargets?.()).resolves.toEqual([]);
    await expect(prepared.sessionManager?.createSession({})).rejects.toThrow(
      'No HarmonyOS devices found',
    );
  });

  test('throws a normal error instead of exiting when direct mode has no devices', async () => {
    getConnectedDevicesMock.mockResolvedValue([]);

    const { harmonyPlaygroundPlatform } = await import('../../src/platform');

    await expect(harmonyPlaygroundPlatform.prepare()).rejects.toThrow(
      'No HarmonyOS devices found',
    );
  });
});
