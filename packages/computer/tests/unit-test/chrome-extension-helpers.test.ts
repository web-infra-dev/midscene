import fs from 'node:fs';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import type { ComputerAgent } from '../../src';
import {
  type CdpTarget,
  openExtensionSidePanel,
  readExtensionId,
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
  const aiAct = rs.fn(async () => undefined);
  const aiWaitFor = rs.fn(async () => undefined);
  const agent = {
    aiAct,
    aiWaitFor,
    interface: {
      inputPrimitives: {
        keyboard: { keyboardPress },
        pointer: { tap },
      },
      size,
    },
  } as unknown as ComputerAgent;
  return { agent, aiAct, aiWaitFor, keyboardPress, size, tap };
}

describe('Chrome extension side-panel helper', () => {
  afterEach(() => {
    rs.restoreAllMocks();
    rs.useRealTimers();
    rs.unstubAllGlobals();
  });

  it('locates native controls visually and waits for the panel to become visible', async () => {
    stubCdpTargets([], [EXTENSION_TARGET]);
    const { agent, tap, aiAct, aiWaitFor, keyboardPress } = createAgent();

    await openExtensionSidePanel(agent, EXTENSION_ID);

    expect(tap).not.toHaveBeenCalled();
    expect(keyboardPress).not.toHaveBeenCalled();
    expect(aiAct).toHaveBeenCalledWith(
      expect.stringContaining('If the Extensions menu is already open'),
    );
    expect(aiWaitFor).toHaveBeenCalledWith(
      expect.stringContaining('popup menu has closed'),
    );
  });

  it('does not toggle an already-open side panel during a test retry', async () => {
    stubCdpTargets([EXTENSION_TARGET]);
    const { agent, size, tap } = createAgent();

    await openExtensionSidePanel(agent, EXTENSION_ID);

    expect(size).not.toHaveBeenCalled();
    expect(tap).not.toHaveBeenCalled();
  });
});

describe('Chrome extension identification', () => {
  afterEach(() => {
    rs.restoreAllMocks();
    rs.unstubAllGlobals();
  });

  it('ignores built-in extension workers before Midscene registers', async () => {
    rs.spyOn(fs, 'existsSync').mockReturnValue(false);
    const builtin = {
      type: 'service_worker',
      url: 'chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome/thunk.js',
    };
    stubCdpTargets(
      [builtin],
      [
        builtin,
        {
          type: 'service_worker',
          url: `chrome-extension://${EXTENSION_ID}/scripts/worker.js`,
        },
      ],
    );

    await expect(readExtensionId(2)).resolves.toBe(EXTENSION_ID);
  });

  it('fails instead of returning an unrelated extension ID', async () => {
    rs.spyOn(fs, 'existsSync').mockReturnValue(false);
    stubCdpTargets([
      {
        type: 'service_worker',
        url: 'chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome/thunk.js',
      },
    ]);

    await expect(readExtensionId(1)).rejects.toThrow(
      'Midscene.js extension not found',
    );
  });
});
