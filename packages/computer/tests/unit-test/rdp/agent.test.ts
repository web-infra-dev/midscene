import type { Size } from '@midscene/core';
import { ComputerAgent, RDPDevice, agentFromComputer } from '../../../src';
import type {
  RDPBackendClient,
  RDPConnectionConfig,
  RDPConnectionInfo,
  RDPMouseButton,
  RDPMouseButtonAction,
  RDPScrollDirection,
} from '../../../src';

class FakeRDPBackend implements RDPBackendClient {
  calls: Array<{ name: string; args: unknown[] }> = [];

  async connect(config: RDPConnectionConfig): Promise<RDPConnectionInfo> {
    this.calls.push({ name: 'connect', args: [config] });
    return {
      sessionId: 'session-1',
      server: `${config.host}:${config.port || 3389}`,
      size: { width: 1920, height: 1080 },
    };
  }

  async disconnect(): Promise<void> {
    this.calls.push({ name: 'disconnect', args: [] });
  }

  async screenshotBase64(): Promise<string> {
    this.calls.push({ name: 'screenshotBase64', args: [] });
    return 'data:image/png;base64,ZmFrZQ==';
  }

  async size(): Promise<Size> {
    this.calls.push({ name: 'size', args: [] });
    return { width: 1920, height: 1080 };
  }

  async mouseMove(x: number, y: number): Promise<void> {
    this.calls.push({ name: 'mouseMove', args: [x, y] });
  }

  async mouseButton(
    button: RDPMouseButton,
    action: RDPMouseButtonAction,
  ): Promise<void> {
    this.calls.push({ name: 'mouseButton', args: [button, action] });
  }

  async wheel(
    direction: RDPScrollDirection,
    amount: number,
    x?: number,
    y?: number,
  ): Promise<void> {
    this.calls.push({ name: 'wheel', args: [direction, amount, x, y] });
  }

  async keyPress(keyName: string): Promise<void> {
    this.calls.push({ name: 'keyPress', args: [keyName] });
  }

  async typeText(text: string): Promise<void> {
    this.calls.push({ name: 'typeText', args: [text] });
  }

  async clearInput(): Promise<void> {
    this.calls.push({ name: 'clearInput', args: [] });
  }
}

describe('@midscene/computer RDP device', () => {
  it('connects and exposes the RDP device through agentFromComputer', async () => {
    const backend = new FakeRDPBackend();
    const agent = await agentFromComputer({
      remote: {
        type: 'rdp',
        host: '10.0.0.1',
        port: 3389,
        username: 'Admin',
        backend,
      },
      generateReport: false,
    });

    expect(agent.interface.interfaceType).toBe('rdp');
    expect(agent.interface.describe()).toContain('10.0.0.1:3389');
    expect(backend.calls[0]?.name).toBe('connect');
  });

  it('allows ComputerAgent to wrap an RDP device directly', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.2',
      backend,
    });
    await device.connect();

    const agent = new ComputerAgent(device);
    expect(agent.interface).toBe(device);
    expect(agent.interface.interfaceType).toBe('rdp');
  });

  it('translates tap into backend pointer calls', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.1',
      backend,
    });
    await device.connect();

    const tap = device.actionSpace().find((action) => action.name === 'Tap');
    expect(tap).toBeDefined();

    await tap!.call({
      locate: {
        id: 'target',
        rect: { left: 90, top: 190, width: 20, height: 20 },
        center: [100, 200],
        content: 'target',
      },
    });

    expect(backend.calls).toEqual(
      expect.arrayContaining([
        { name: 'mouseMove', args: [100, 200] },
        { name: 'mouseButton', args: ['left', 'click'] },
      ]),
    );
  });

  it('clears then types through the backend input action', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.1',
      backend,
    });
    await device.connect();

    const input = device
      .actionSpace()
      .find((action) => action.name === 'Input');
    expect(input).toBeDefined();

    await input!.call({
      value: 'hello',
      mode: 'replace',
      locate: {
        id: 'field',
        rect: { left: 0, top: 0, width: 10, height: 10 },
        center: [5, 5],
        content: '',
      },
    });

    expect(backend.calls).toEqual(
      expect.arrayContaining([
        { name: 'mouseMove', args: [5, 5] },
        { name: 'mouseButton', args: ['left', 'click'] },
        { name: 'clearInput', args: [] },
        { name: 'typeText', args: ['hello'] },
      ]),
    );
  });
});
