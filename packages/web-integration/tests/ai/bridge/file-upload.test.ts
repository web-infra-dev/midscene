import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import {
  AgentOverChromeBridge,
  type getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 3 * 60 * 1000,
});

const describeIf = process.env.BRIDGE_MODE ? describe : describe.skip;

const fixturePath = (filename: string) =>
  join(__dirname, '../fixtures', filename);

async function startFixtureServer(filename: string) {
  const html = readFileSync(fixturePath(filename), 'utf8');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

async function evaluateJson<T>(
  page: ReturnType<typeof getBridgePageInCliSide>,
  expression: string,
): Promise<T> {
  const response = await page.evaluateJavaScript(
    `JSON.stringify((${expression})())`,
  );
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description);
  }
  return JSON.parse(response.result.value) as T;
}

describeIf('file upload in bridge mode', () => {
  let agent: AgentOverChromeBridge | undefined;
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    try {
      await agent?.destroy();
    } finally {
      agent = undefined;
    }

    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }
  });

  it('accepts files through the chrome extension bridge', async () => {
    const fixtureServer = await startFixtureServer('file-upload.html');
    closeServer = fixtureServer.close;
    const testFile = fixturePath('test-file.txt');

    agent = new AgentOverChromeBridge({
      closeNewTabsAfterDisconnect: true,
    });
    await agent.connectNewTabWithUrl(fixtureServer.url);

    await agent.aiTap('Choose Single File', {
      xpath: '//*[@id="single-file-input"]/following-sibling::button[1]',
      fileChooserAccept: [testFile],
    });

    const selected = await evaluateJson<{
      files: string[];
      selectedText: string;
    }>(
      agent.page,
      `() => {
        const input = document.querySelector('#single-file-input');
        return {
          files: Array.from(input.files || []).map((file) => file.name),
          selectedText:
            document.querySelector('#selected-files')?.textContent || '',
        };
      }`,
    );

    expect(selected.files).toEqual(['test-file.txt']);
    expect(selected.selectedText).toContain('test-file.txt');
    expect(selected.selectedText).toContain('single');
  });
});
