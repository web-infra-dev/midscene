import { beforeEach, describe, expect, rs, test } from '@rstest/core';

const agentFromWebDriverAgentMock = rs.fn();
const getConnectedDeviceInfoMock = rs.fn();
const findAvailablePortMock = rs.fn(async (port: number) => port);

rs.mock('@midscene/shared/node', () => ({
  findAvailablePort: findAvailablePortMock,
}));

rs.mock('../../src/agent', () => ({
  agentFromWebDriverAgent: agentFromWebDriverAgentMock,
}));

const mockAgent = {
  interface: {
    getConnectedDeviceInfo: getConnectedDeviceInfoMock,
  },
  destroy: rs.fn(),
};

describe('iosPlaygroundPlatform session manager', () => {
  beforeEach(() => {
    rs.clearAllMocks();
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
    const prepared = await iosPlaygroundPlatform.prepare({});
    const setup = await prepared.sessionManager!.getSetupSchema!();

    expect(setup?.fields).toMatchObject([
      { key: 'host', required: false },
      { key: 'port', required: false },
      { key: 'baseUrl', required: false },
      { key: 'mjpegUrl', required: false },
      { key: 'mjpegPort', required: false },
      { key: 'sessionId', required: false },
    ]);
    expect(setup?.fields?.[0]).not.toHaveProperty('defaultValue');
    expect(setup?.fields?.[1]).not.toHaveProperty('defaultValue');

    const created = await prepared.sessionManager?.createSession({
      host: 'localhost',
      port: 8100,
      sessionId: 'external-session-id',
    });

    expect(created?.displayName).toBe('iPhone 16 (Simulator)');
    expect(created?.metadata).toMatchObject({
      wdaHost: 'localhost',
      wdaPort: 8100,
      sessionId: 'external-session-id',
    });
    expect(agentFromWebDriverAgentMock).toHaveBeenCalledWith({
      wdaHost: 'localhost',
      wdaPort: 8100,
      sessionId: 'external-session-id',
    });
  });

  test('passes a normalized gateway base URL to the agent and session factory', async () => {
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare({});
    const created = await prepared.sessionManager?.createSession({
      baseUrl: 'https://gateway.example/code/wda/',
    });
    await created?.agentFactory?.();

    expect(agentFromWebDriverAgentMock).toHaveBeenNthCalledWith(1, {
      wdaBaseUrl: 'https://gateway.example/code/wda',
    });
    expect(agentFromWebDriverAgentMock).toHaveBeenNthCalledWith(2, {
      wdaBaseUrl: 'https://gateway.example/code/wda',
    });
  });

  test.each([
    { host: 'localhost' },
    { port: 8100 },
    { host: 'localhost', port: 8100 },
  ])('rejects gateway base URL with host or port input: %j', async (input) => {
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare({});

    await expect(
      prepared.sessionManager?.createSession({
        baseUrl: 'https://gateway.example/code/wda',
        ...input,
      }),
    ).rejects.toThrow(/wdaBaseUrl cannot be used with wdaHost or wdaPort/);
    expect(agentFromWebDriverAgentMock).not.toHaveBeenCalled();
  });

  test('treats empty optional host and port fields as unset', async () => {
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare({});

    await prepared.sessionManager?.createSession({
      baseUrl: 'https://gateway.example/code/wda',
      host: '',
      port: '',
    });

    expect(agentFromWebDriverAgentMock).toHaveBeenCalledWith({
      wdaBaseUrl: 'https://gateway.example/code/wda',
    });
  });

  test('passes a remote HTTPS MJPEG stream URL to the agent and its factory', async () => {
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare({});
    const created = await prepared.sessionManager?.createSession({
      baseUrl: 'https://gateway.example/code/wda',
      mjpegUrl: 'https://stream.example/live/mjpeg?token=secret',
      mjpegPort: '',
    });
    await created?.agentFactory?.();

    expect(agentFromWebDriverAgentMock).toHaveBeenNthCalledWith(1, {
      wdaBaseUrl: 'https://gateway.example/code/wda',
      wdaMjpegUrl: 'https://stream.example/live/mjpeg?token=secret',
    });
    expect(agentFromWebDriverAgentMock).toHaveBeenNthCalledWith(2, {
      wdaBaseUrl: 'https://gateway.example/code/wda',
      wdaMjpegUrl: 'https://stream.example/live/mjpeg?token=secret',
    });
    expect(JSON.stringify(created?.metadata)).not.toContain('secret');
  });

  test('rejects a remote MJPEG URL combined with a port', async () => {
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare({});
    await expect(
      prepared.sessionManager?.createSession({
        mjpegUrl: 'https://stream.example/live/mjpeg',
        mjpegPort: 9100,
      }),
    ).rejects.toThrow(/wdaMjpegUrl cannot be used with wdaMjpegPort/);
    expect(agentFromWebDriverAgentMock).not.toHaveBeenCalled();
  });

  test('does not expose a gateway path identifier in session metadata', async () => {
    getConnectedDeviceInfoMock.mockResolvedValue(null);
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare({});
    const created = await prepared.sessionManager?.createSession({
      baseUrl: 'https://gateway.example/secret-code/wda',
    });

    expect(created?.displayName).toBe('gateway.example (WDA gateway)');
    expect(created?.metadata).toMatchObject({
      wdaHost: 'gateway.example',
      wdaPort: 443,
    });
    expect(JSON.stringify(created?.metadata)).not.toContain('secret-code');
    expect(created?.metadata?.wdaGatewayId).toMatch(
      /^ios-gateway-[a-f0-9]{64}$/,
    );

    const other = await prepared.sessionManager?.createSession({
      baseUrl: 'https://gateway.example/other-code/wda',
    });
    expect(other?.metadata?.wdaGatewayId).not.toBe(
      created?.metadata?.wdaGatewayId,
    );
    const otherSession = await prepared.sessionManager?.createSession({
      baseUrl: 'https://gateway.example/secret-code/wda',
      sessionId: 'session-2',
    });
    expect(otherSession?.metadata?.wdaGatewayId).not.toBe(
      created?.metadata?.wdaGatewayId,
    );
  });

  test('reuses the agent factory for follow-up playground sessions', async () => {
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare({});
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

  test('passes host Agent options to each new iOS Agent', async () => {
    const agentOptions = {
      replanningCycleLimit: 12,
      waitAfterAction: 500,
      screenshotShrinkFactor: 2,
    };
    const { iosPlaygroundPlatform } = await import('../../src/platform');
    const prepared = await iosPlaygroundPlatform.prepare({
      getAgentOptions: () => agentOptions,
    });
    const created = await prepared.sessionManager?.createSession({
      host: 'localhost',
      port: 8100,
    });
    await created?.agentFactory?.();

    expect(agentFromWebDriverAgentMock).toHaveBeenNthCalledWith(1, {
      ...agentOptions,
      wdaHost: 'localhost',
      wdaPort: 8100,
    });
    expect(agentFromWebDriverAgentMock).toHaveBeenNthCalledWith(2, {
      ...agentOptions,
      wdaHost: 'localhost',
      wdaPort: 8100,
    });
  });
});
