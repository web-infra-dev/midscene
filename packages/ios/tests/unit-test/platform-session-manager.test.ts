import { beforeEach, describe, expect, test, vi } from 'vitest';

const connectMock = vi.fn();
const getConnectedDeviceInfoMock = vi.fn();
const findAvailablePortMock = vi.fn(async (port: number) => port);

vi.mock('@midscene/shared/node', () => ({
  findAvailablePort: findAvailablePortMock,
}));

vi.mock('../../src/device', () => ({
  IOSDevice: vi.fn().mockImplementation(() => ({
    connect: connectMock,
    getConnectedDeviceInfo: getConnectedDeviceInfoMock,
  })),
}));

vi.mock('../../src/agent', () => ({
  IOSAgent: vi.fn().mockImplementation((device) => ({
    interface: device,
    destroy: vi.fn(),
  })),
}));

describe('iosPlaygroundPlatform session manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectMock.mockResolvedValue(undefined);
    getConnectedDeviceInfoMock.mockResolvedValue({
      name: 'iPhone 16',
      model: 'Simulator',
      udid: 'SIM-123',
    });
  });

  test('returns WDA setup fields and creates a connected session', async () => {
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare();
    const setup = await prepared.sessionManager?.getSetupSchema();

    expect(setup?.fields).toMatchObject([
      { key: 'host', defaultValue: 'localhost' },
      { key: 'port', defaultValue: 8100 },
    ]);

    const created = await prepared.sessionManager?.createSession({
      host: 'localhost',
      port: 8100,
    });

    expect(created?.displayName).toBe('iPhone 16 (Simulator)');
    expect(created?.metadata).toMatchObject({
      wdaHost: 'localhost',
      wdaPort: 8100,
    });
    expect(connectMock).toHaveBeenCalled();
  });
});
