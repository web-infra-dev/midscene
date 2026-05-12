import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Rect, Size } from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { ComputerAgent, RDPDevice } from '../../../src';
import type {
  RDPBackendClient,
  RDPConnectionConfig,
  RDPConnectionInfo,
  RDPMouseButton,
  RDPMouseButtonAction,
  RDPScrollDirection,
} from '../../../src';

interface FixtureTreeNode {
  node?: {
    content?: string;
    rect?: Rect;
  } | null;
  children?: FixtureTreeNode[];
}

interface FixtureDump {
  screenshotBase64: string;
  shotSize: Size;
  tree?: FixtureTreeNode;
}

type BackendCall =
  | { name: 'connect'; args: [RDPConnectionConfig] }
  | { name: 'disconnect'; args: [] }
  | { name: 'screenshotBase64'; args: [] }
  | { name: 'size'; args: [] }
  | { name: 'mouseMove'; args: [number, number] }
  | { name: 'mouseButton'; args: [RDPMouseButton, RDPMouseButtonAction] }
  | { name: 'wheel'; args: [RDPScrollDirection, number, number?, number?] }
  | { name: 'keyPress'; args: [string] }
  | { name: 'typeText'; args: [string] }
  | { name: 'clearInput'; args: [] };

class FixtureRDPBackend implements RDPBackendClient {
  readonly calls: BackendCall[] = [];

  constructor(private readonly fixture: FixtureDump) {}

  private currentSize(): Size {
    return {
      width: this.fixture.shotSize.width,
      height: this.fixture.shotSize.height,
    };
  }

  async connect(config: RDPConnectionConfig): Promise<RDPConnectionInfo> {
    this.calls.push({ name: 'connect', args: [config] });
    return {
      sessionId: 'fixture-session',
      server: `${config.host}:${config.port || 3389}`,
      size: this.currentSize(),
    };
  }

  async disconnect(): Promise<void> {
    this.calls.push({ name: 'disconnect', args: [] });
  }

  async screenshotBase64(): Promise<string> {
    this.calls.push({ name: 'screenshotBase64', args: [] });
    return this.fixture.screenshotBase64;
  }

  async size(): Promise<Size> {
    this.calls.push({ name: 'size', args: [] });
    return this.currentSize();
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

const fixturePath = path.join(
  __dirname,
  '../../../../web-integration/tests/ai/fixtures/ui-context.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureDump;

function findRectByContent(
  tree: FixtureTreeNode | undefined,
  content: string,
): Rect {
  if (!tree) {
    throw new Error(`Fixture tree is missing while looking for "${content}"`);
  }

  const queue: FixtureTreeNode[] = [tree];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.node?.content === content && current.node.rect) {
      return current.node.rect;
    }
    if (current.children?.length) {
      queue.push(...current.children);
    }
  }

  throw new Error(`Unable to find rect for "${content}" in fixture tree`);
}

function isPointInsideRect(x: number, y: number, rect: Rect): boolean {
  return (
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height
  );
}

describe(
  '@midscene/computer RDP AI login flow',
  {
    timeout: 3 * 60 * 1000,
  },
  () => {
    it('uses the screenshot to fill the login form and click Login', async () => {
      const usernameRect = findRectByContent(fixture.tree, 'Username');
      const passwordRect = findRectByContent(fixture.tree, 'Password');
      const loginRect = findRectByContent(fixture.tree, 'Login');

      const backend = new FixtureRDPBackend(fixture);
      const device = new RDPDevice({
        host: '10.75.166.249',
        username: 'Admin',
        backend,
      });
      await device.connect();

      const agent = new ComputerAgent(device, {
        aiActionContext:
          'You are controlling a remote desktop through the RDP protocol. Use Input for text fields and Tap for buttons based only on the visible screenshot.',
        generateReport: true,
        autoPrintReportMsg: false,
        reportFileName: 'rdp-fixture-login-form-ai-report',
      });

      try {
        await agent.aiAct(
          'Click the Username field and type standard_user. Click the Password field and type secret_sauce. Then click the Login button.',
        );
      } finally {
        await device.destroy();
      }

      const typedValues = backend.calls
        .filter((call): call is Extract<BackendCall, { name: 'typeText' }> => {
          return call.name === 'typeText';
        })
        .map((call) => call.args[0]);
      expect(typedValues).toEqual(
        expect.arrayContaining(['standard_user', 'secret_sauce']),
      );

      const movedPoints = backend.calls
        .filter((call): call is Extract<BackendCall, { name: 'mouseMove' }> => {
          return call.name === 'mouseMove';
        })
        .map((call) => ({
          x: call.args[0],
          y: call.args[1],
        }));
      expect(
        movedPoints.some(({ x, y }) => isPointInsideRect(x, y, usernameRect)),
      ).toBe(true);
      expect(
        movedPoints.some(({ x, y }) => isPointInsideRect(x, y, passwordRect)),
      ).toBe(true);
      expect(
        movedPoints.some(({ x, y }) => isPointInsideRect(x, y, loginRect)),
      ).toBe(true);

      const leftClicks = backend.calls.filter((call) => {
        return (
          call.name === 'mouseButton' &&
          call.args[0] === 'left' &&
          call.args[1] === 'click'
        );
      });
      expect(leftClicks.length).toBeGreaterThanOrEqual(3);
      expect(
        backend.calls.filter((call) => call.name === 'clearInput').length,
      ).toBeGreaterThanOrEqual(2);
    });
  },
);
