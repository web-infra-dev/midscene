import { getBridgePageInCliSide } from '@/bridge-mode/agent-cli-side';
import { BridgeEvent, MouseEvent } from '@/bridge-mode/common';
import { BridgeClient } from '@/bridge-mode/io-client';
import { afterEach, describe, expect, it } from 'vitest';

const DEFAULT_HOST = '127.0.0.1';
let testPort = 16376;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('bridge file chooser adapter', () => {
  let client: BridgeClient | undefined;
  let page: ReturnType<typeof getBridgePageInCliSide> | undefined;

  afterEach(async () => {
    try {
      await page?.destroy();
    } catch {}
    client?.disconnect();
    page = undefined;
    client = undefined;
  });

  it('converts registerFileChooserListener into bridge file accept calls', async () => {
    const port = testPort++;
    const calls: { method: string; args: any[] }[] = [];
    const remoteFileChooserError = {
      message: 'remote file chooser failed',
      name: 'Error',
    };

    page = getBridgePageInCliSide({ port, timeout: 2000 });
    await sleep(50);

    client = new BridgeClient(
      `ws://${DEFAULT_HOST}:${port}`,
      async (method, args) => {
        calls.push({ method, args });
        if (method === BridgeEvent.GetFileChooserError) {
          return remoteFileChooserError;
        }
        return undefined;
      },
    );
    await client.connect();

    const registration = await page.registerFileChooserListener(
      async (chooser) => {
        await chooser.accept(['/tmp/upload.txt']);
      },
    );

    expect(calls).toContainEqual({
      method: BridgeEvent.RegisterFileChooserAccept,
      args: [['/tmp/upload.txt']],
    });

    await page.mouse.click(10, 20);

    expect(calls).toContainEqual({
      method: MouseEvent.Click,
      args: [10, 20],
    });
    expect(
      calls.some((call) => call.method === BridgeEvent.GetFileChooserError),
    ).toBe(true);
    expect((await registration.getError())?.message).toBe(
      'remote file chooser failed',
    );

    registration.dispose();
    await sleep(50);
    expect(
      calls.some((call) => call.method === BridgeEvent.ClearFileChooserAccept),
    ).toBe(true);
  });
});
