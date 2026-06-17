import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { puppeteerAgentForTarget } from '@/puppeteer/agent-launcher';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';
import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// End-to-end check that `downloadPath` declared in a YAML script controls
// Chrome's actual download location. A mock-based unit test only proves that
// we send a CDP command; this verifies the user-visible file placement.
describe('downloadPath via YAML (puppeteer)', () => {
  let server: Server;
  let baseUrl: string;
  let downloadDir: string | undefined;
  let fileName: string | undefined;

  const runYaml = async (yamlString: string) => {
    const script = parseYamlScript(yamlString);
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      puppeteerAgentForTarget,
    );
    await player.run();
    expect(player.status, player.errorInSetup?.message).toBe('done');
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/download') {
        res.writeHead(200, {
          'content-type': 'text/plain',
          'content-disposition': `attachment; filename="${fileName}"`,
        });
        res.end('download-ok');
        return;
      }

      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        '<html><body><a id="download" href="/download">Download</a></body></html>',
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${port}/`;
  });

  afterAll(() => {
    server?.close();
  });

  afterEach(() => {
    if (fileName) {
      rmSync(path.join(homedir(), 'Downloads', fileName), { force: true });
    }
    if (downloadDir) {
      rmSync(downloadDir, { recursive: true, force: true });
    }
    downloadDir = undefined;
    fileName = undefined;
  });

  it('downloads files into the YAML downloadPath directory', async () => {
    downloadDir = mkdtempSync(path.join(tmpdir(), 'midscene-download-path-'));
    fileName = `midscene-download-path-${Date.now()}.txt`;

    await runYaml(`
web:
  url: ${baseUrl}
  downloadPath: ${downloadDir}
  waitForNetworkIdle:
    timeout: 0
tasks:
  - name: download file
    flow:
      - javascript: document.querySelector("#download").click();
      - sleep: 1200
`);

    const expectedFile = path.join(downloadDir, fileName);
    expect(existsSync(expectedFile)).toBe(true);
    expect(readFileSync(expectedFile, 'utf8')).toBe('download-ok');
    expect(existsSync(path.join(homedir(), 'Downloads', fileName))).toBe(false);
  });
});
