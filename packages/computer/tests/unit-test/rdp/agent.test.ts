import type {
  ExecutorContext,
  LocateResultElement,
  Size,
} from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { ComputerAgent, RDPDevice, agentForRDPComputer } from '../../../src';
import type {
  RDPBackendClient,
  RDPConnectionConfig,
  RDPConnectionInfo,
  RDPMouseButton,
  RDPMouseButtonAction,
  RDPScrollDirection,
} from '../../../src';
import { formatRdpServerAddress } from '../../../src/rdp/address';

class FakeRDPBackend implements RDPBackendClient {
  calls: Array<{ name: string; args: unknown[] }> = [];

  async connect(config: RDPConnectionConfig): Promise<RDPConnectionInfo> {
    this.calls.push({ name: 'connect', args: [config] });
    return {
      sessionId: 'session-1',
      server: formatRdpServerAddress(config.host, config.port || 3389),
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

const mockExecutorContext = { task: {} } as ExecutorContext;

function createLocate(
  center: [number, number],
  content = 'target',
): LocateResultElement {
  return {
    description: content,
    rect: {
      left: center[0] - 10,
      top: center[1] - 10,
      width: 20,
      height: 20,
    },
    center,
  };
}

describe('@midscene/computer RDP device', () => {
  it('connects and exposes the RDP device through agentForRDPComputer', async () => {
    const backend = new FakeRDPBackend();
    const agent = await agentForRDPComputer({
      host: '10.0.0.1',
      port: 3389,
      username: 'Admin',
      backend,
      generateReport: false,
    });

    expect(agent.interface.interfaceType).toBe('rdp');
    expect(agent.interface.describe()).toContain('10.0.0.1:3389');
    expect(backend.calls[0]?.name).toBe('connect');
  });

  it('forwards only serializable connection settings to the backend', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.3',
      port: 3389,
      username: 'Admin',
      password: 'secret',
      localAddress: '10.0.0.20',
      ignoreCertificate: true,
      backend,
      customActions: [],
    });
    await device.connect();

    const connectCall = backend.calls.find((call) => call.name === 'connect');
    const config = connectCall?.args[0] as Record<string, unknown>;
    // The backend instance and custom actions are runtime objects that must
    // never be serialized into the helper's JSON connection request.
    expect(config).not.toHaveProperty('backend');
    expect(config).not.toHaveProperty('customActions');
    expect(config).toMatchObject({
      host: '10.0.0.3',
      port: 3389,
      username: 'Admin',
      password: 'secret',
      localAddress: '10.0.0.20',
      ignoreCertificate: true,
    });
  });

  it('passes localAddress through agentForRDPComputer', async () => {
    const backend = new FakeRDPBackend();
    await agentForRDPComputer({
      host: '10.0.0.4',
      port: 3389,
      username: 'Admin',
      localAddress: '10.0.0.20',
      backend,
      generateReport: false,
    });

    expect(backend.calls[0]).toEqual({
      name: 'connect',
      args: [
        expect.objectContaining({
          host: '10.0.0.4',
          localAddress: '10.0.0.20',
        }),
      ],
    });
  });

  it('normalizes and brackets IPv6 hosts in RDP device metadata', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '[2001:db8::10]',
      port: 3390,
      backend,
    });
    await device.connect();

    expect(backend.calls[0]).toEqual({
      name: 'connect',
      args: [
        expect.objectContaining({
          host: '2001:db8::10',
          port: 3390,
        }),
      ],
    });
    expect(device.describe()).toContain('[2001:db8::10]:3390');

    const listDisplays = device
      .actionSpace()
      .find((action) => action.name === 'ListDisplays');

    await expect(
      listDisplays!.call(undefined, mockExecutorContext),
    ).resolves.toEqual([
      {
        id: 'session-1',
        name: 'RDP [2001:db8::10]:3390 (1920x1080)',
        primary: true,
      },
    ]);
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

    await tap!.call(
      {
        locate: createLocate([100, 200]),
      },
      mockExecutorContext,
    );

    const mouseMoves = backend.calls.filter(
      (call) => call.name === 'mouseMove',
    );
    expect(mouseMoves).toHaveLength(8);
    expect(mouseMoves.at(-1)).toEqual({
      name: 'mouseMove',
      args: [100, 200],
    });
    expect(backend.calls.slice(-2)).toEqual([
      { name: 'mouseButton', args: ['left', 'down'] },
      { name: 'mouseButton', args: ['left', 'up'] },
    ]);
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

    await input!.call(
      {
        value: 'hello',
        mode: 'replace',
        locate: createLocate([5, 5], 'field'),
      },
      mockExecutorContext,
    );

    expect(backend.calls).toEqual(
      expect.arrayContaining([
        { name: 'mouseMove', args: [5, 5] },
        { name: 'mouseButton', args: ['left', 'down'] },
        { name: 'mouseButton', args: ['left', 'up'] },
        { name: 'clearInput', args: [] },
        { name: 'typeText', args: ['hello'] },
      ]),
    );
  });

  it('lists the connected RDP display as a single primary monitor', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.1',
      backend,
    });
    await device.connect();

    const listDisplays = device
      .actionSpace()
      .find((action) => action.name === 'ListDisplays');
    expect(listDisplays).toBeDefined();

    await expect(
      listDisplays!.call(undefined, mockExecutorContext),
    ).resolves.toEqual([
      {
        id: 'session-1',
        name: 'RDP 10.0.0.1:3389 (1920x1080)',
        primary: true,
      },
    ]);
  });

  it('moves smoothly for hover and keeps the final pointer position', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.1',
      backend,
    });
    await device.connect();

    const hover = device
      .actionSpace()
      .find((action) => action.name === 'Hover');
    expect(hover).toBeDefined();

    await hover!.call(
      {
        locate: createLocate([300, 400], 'hover-target'),
      },
      mockExecutorContext,
    );

    const mouseMoves = backend.calls.filter(
      (call) => call.name === 'mouseMove',
    );
    expect(mouseMoves).toHaveLength(10);
    expect(mouseMoves.at(-1)).toEqual({
      name: 'mouseMove',
      args: [300, 400],
    });
    expect(backend.calls.some((call) => call.name === 'mouseButton')).toBe(
      false,
    );
  });

  it('splits scroll into repeated wheel steps and anchors them to the target', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.1',
      backend,
    });
    await device.connect();

    const scroll = device
      .actionSpace()
      .find((action) => action.name === 'Scroll');
    expect(scroll).toBeDefined();

    await scroll!.call(
      {
        direction: 'down',
        distance: 360,
        scrollType: 'singleAction',
        locate: createLocate([640, 360], 'scroll-target'),
      },
      mockExecutorContext,
    );

    const wheelCalls = backend.calls.filter((call) => call.name === 'wheel');
    expect(wheelCalls).toEqual([
      { name: 'wheel', args: ['down', 120, 640, 360] },
      { name: 'wheel', args: ['down', 120, 640, 360] },
      { name: 'wheel', args: ['down', 120, 640, 360] },
    ]);
  });

  it('drags with a held press and releases on the drop target', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.1',
      backend,
    });
    await device.connect();

    const dragAndDrop = device
      .actionSpace()
      .find((action) => action.name === 'DragAndDrop');
    expect(dragAndDrop).toBeDefined();

    await dragAndDrop!.call(
      {
        from: createLocate([200, 220], 'drag-source'),
        to: createLocate([800, 640], 'drag-target'),
      },
      mockExecutorContext,
    );

    const mouseButtons = backend.calls.filter(
      (call) => call.name === 'mouseButton',
    );
    expect(mouseButtons).toEqual([
      { name: 'mouseButton', args: ['left', 'down'] },
      { name: 'mouseButton', args: ['left', 'up'] },
    ]);
    expect(backend.calls.findLast((call) => call.name === 'mouseMove')).toEqual(
      {
        name: 'mouseMove',
        args: [800, 640],
      },
    );
  });
});
