import { afterEach, describe, expect, it, rs } from '@rstest/core';
import type { ComputerAgent } from '../../src';
import {
  type CdpTarget,
  openExtensionSidePanel,
} from '../ai/chrome-extension-helpers';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const EXTENSION_TARGET: CdpTarget = {
  type: 'page',
  url: `chrome-extension://${EXTENSION_ID}/index.html`,
  webSocketDebuggerUrl: 'ws://extension',
};

function stubCdpTargets(...responses: CdpTarget[][]) {
  let callIndex = 0;
  rs.stubGlobal(
    'fetch',
    rs.fn(async () => ({
      json: async () => responses[Math.min(callIndex++, responses.length - 1)],
    })),
  );
}

function createAgent() {
  const tap = rs.fn(async () => undefined);
  const keyboardPress = rs.fn(async () => undefined);
  const size = rs.fn(async () => ({ width: 1920, height: 1080 }));
  const aiTap = rs.fn(async () => undefined);
  const agent = {
    aiTap,
    interface: {
      inputPrimitives: {
        keyboard: { keyboardPress },
        pointer: { tap },
      },
      size,
    },
  } as unknown as ComputerAgent;
  return { agent, aiTap, keyboardPress, size, tap };
}

describe('Chrome extension side-panel helper', () => {
  afterEach(() => {
    rs.useRealTimers();
    rs.unstubAllGlobals();
  });

  it('opens the extension through stable browser-chrome coordinates', async () => {
    stubCdpTargets([], [EXTENSION_TARGET]);
    const { agent, tap } = createAgent();

    await openExtensionSidePanel(agent, EXTENSION_ID);

    expect(tap).toHaveBeenNthCalledWith(1, { x: 1760, y: 72 });
    expect(tap).toHaveBeenNthCalledWith(2, { x: 1554, y: 228 });
  });

  it('falls back to vision when Chrome ignores the native-menu click', async () => {
    rs.useFakeTimers();
    const { agent, aiTap, keyboardPress } = createAgent();
    rs.stubGlobal(
      'fetch',
      rs.fn(async () => ({
        json: async () =>
          aiTap.mock.calls.length === 2 ? [EXTENSION_TARGET] : [],
      })),
    );

    const openPromise = openExtensionSidePanel(agent, EXTENSION_ID);
    await rs.runAllTimersAsync();
    await openPromise;

    expect(keyboardPress).toHaveBeenCalledWith('Escape');
    expect(aiTap).toHaveBeenCalledTimes(2);
    expect(aiTap.mock.calls[0][0]).toContain('Extensions button');
    expect(aiTap.mock.calls[1][0]).toContain('Midscene.js');
  });

  it('does not toggle an already-open side panel during a test retry', async () => {
    stubCdpTargets([EXTENSION_TARGET]);
    const { agent, size, tap } = createAgent();

    await openExtensionSidePanel(agent, EXTENSION_ID);

    expect(size).not.toHaveBeenCalled();
    expect(tap).not.toHaveBeenCalled();
  });
});
