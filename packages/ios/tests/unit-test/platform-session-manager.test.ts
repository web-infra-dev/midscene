import { beforeEach, describe, expect, test, vi } from 'vitest';

const agentFromWebDriverAgentMock = vi.fn();
const getConnectedDeviceInfoMock = vi.fn();
const findAvailablePortMock = vi.fn(async (port: number) => port);

vi.mock('@midscene/shared/node', () => ({
  findAvailablePort: findAvailablePortMock,
}));

vi.mock('../../src/agent', () => ({
  agentFromWebDriverAgent: agentFromWebDriverAgentMock,
}));

const mockAgent = {
  interface: {
    getConnectedDeviceInfo: getConnectedDeviceInfoMock,
  },
  destroy: vi.fn(),
};

describe('iosPlaygroundPlatform session manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentFromWebDriverAgentMock.mockResolvedValue({
      ...mockAgent,
      interface: {
        getConnectedDeviceInfo: getConnectedDeviceInfoMock,
      },
    });
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
    expect(agentFromWebDriverAgentMock).toHaveBeenCalledWith({
      wdaHost: 'localhost',
      wdaPort: 8100,
    });
  });

  test('reuses the agent factory for follow-up playground sessions', async () => {
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare();
    const created = await prepared.sessionManager?.createSession({
      host: 'https://wda.example.com',
      port: '8300',
    });

    await created?.agentFactory?.();

    expect(agentFromWebDriverAgentMock).toHaveBeenNthCalledWith(1, {
      wdaHost: 'wda.example.com',
      wdaPort: 8300,
    });
    expect(agentFromWebDriverAgentMock).toHaveBeenNthCalledWith(2, {
      wdaHost: 'wda.example.com',
      wdaPort: 8300,
    });
  });
});
