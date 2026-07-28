import { createServer } from 'node:net';
import { ScreenshotItem } from '@midscene/core';
import { PlaygroundServer } from '@midscene/playground';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StaticPage, StaticPageAgent } from '../../src/static';

async function findLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Failed to allocate a loopback test port'));
        return;
      }
      probe.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

describe('Playground Server', () => {
  let server: PlaygroundServer;
  let serverBase: string;
  beforeAll(async () => {
    const page = new StaticPage({
      shotSize: { width: 800, height: 600 },
      shrunkShotToLogicalRatio: 1,
      screenshot: ScreenshotItem.create('', Date.now()),
    });
    const agent = new StaticPageAgent(page);
    server = new PlaygroundServer(agent);
    await server.launch(await findLoopbackPort());
    serverBase = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('post context', async () => {
    const contextValue = 'bar';
    const res = await fetch(`${serverBase}/playground-with-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: contextValue,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const contextId = data.uuid;

    // retrieve context
    const contextRes = await fetch(`${serverBase}/context/${contextId}`);
    const context = await contextRes.json();
    expect(context).toBeDefined();
    expect(context.context).toBe(contextValue);
  });

  it('updates static context with a JSON-serialized ScreenshotItem', async () => {
    const screenshotBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const serializedScreenshot = JSON.parse(
      JSON.stringify(ScreenshotItem.create(screenshotBase64, Date.now())),
    );

    const res = await fetch(`${serverBase}/action-space`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: {
          shotSize: { width: 800, height: 600 },
          shrunkShotToLogicalRatio: 1,
          screenshot: serializedScreenshot,
        },
      }),
    });

    expect(res.status).toBe(200);

    const screenshotRes = await fetch(`${serverBase}/screenshot`);
    expect(screenshotRes.status).toBe(200);
    const screenshot = await screenshotRes.json();
    expect(screenshot.screenshot).toMatch(/^data:image\/webp;base64,UklGR/);
  });
});
