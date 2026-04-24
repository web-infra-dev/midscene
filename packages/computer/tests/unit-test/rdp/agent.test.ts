import type { Size } from '@midscene/core';
import { ComputerAgent, RDPDevice, agentForRDPComputer } from '../../../src';
import type {
  LocateResultElement,
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

function createLocate(
  center: [number, number],
  content = 'target',
): LocateResultElement {
  return {
    id: content,
    rect: {
      left: center[0] - 10,
      top: center[1] - 10,
      width: 20,
      height: 20,
    },
    center,
    content,
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
      locate: createLocate([100, 200]),
    });

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

    await input!.call({
      value: 'hello',
      mode: 'replace',
      locate: createLocate([5, 5], 'field'),
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

    await expect(listDisplays!.call(undefined)).resolves.toEqual([
      {
        id: 'session-1',
        name: 'RDP 10.0.0.1:3389 (1920x1080)',
        primary: true,
      },
    ]);
  });

  it('supports middle click through the RDP backend', async () => {
    const backend = new FakeRDPBackend();
    const device = new RDPDevice({
      host: '10.0.0.1',
      backend,
    });
    await device.connect();

    const middleClick = device
      .actionSpace()
      .find((action) => action.name === 'MiddleClick');
    expect(middleClick).toBeDefined();

    await middleClick!.call({
      locate: createLocate([120, 240], 'middle-target'),
    });

    expect(backend.calls.at(-1)).toEqual({
      name: 'mouseButton',
      args: ['middle', 'click'],
    });
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

    await hover!.call({
      locate: createLocate([300, 400], 'hover-target'),
    });

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

    await scroll!.call({
      direction: 'down',
      distance: 360,
      scrollType: 'singleAction',
      locate: createLocate([640, 360], 'scroll-target'),
    });

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

    await dragAndDrop!.call({
      from: createLocate([200, 220], 'drag-source'),
      to: createLocate([800, 640], 'drag-target'),
    });

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
