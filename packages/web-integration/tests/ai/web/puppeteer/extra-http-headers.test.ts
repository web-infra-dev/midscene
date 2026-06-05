import type { IncomingHttpHeaders } from 'node:http';
import { type Server, createServer } from 'node:http';
import { puppeteerAgentForTarget } from '@/puppeteer/agent-launcher';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';
import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

// End-to-end check that `extraHTTPHeaders` declared in a YAML script actually
// reaches the server. This drives the full user-facing path
// (parseYamlScript -> ScriptPlayer -> puppeteerAgentForTarget -> real browser)
// against a local server and inspects the headers that arrived — a mock-based
// unit test only proves we call `setExtraHTTPHeaders`.
describe('extraHTTPHeaders via YAML (puppeteer)', () => {
  let server: Server;
  let baseUrl: string;
  let received: IncomingHttpHeaders[] = [];

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
      received.push(req.headers);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>ok</body></html>');
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

  beforeEach(() => {
    received = [];
  });

  it('sends custom headers declared in the YAML web config', async () => {
    await runYaml(`
web:
  url: ${baseUrl}
  extraHTTPHeaders:
    X-Custom-Token: my-secret-token
    X-From-Midscene: "yes"
tasks:
  - name: noop
    flow:
      - sleep: 50
`);

    const docReq = received.find((h) => h['x-custom-token'] !== undefined);
    expect(docReq?.['x-custom-token']).toBe('my-secret-token');
    expect(docReq?.['x-from-midscene']).toBe('yes');
  });

  it('does not send custom headers when the YAML omits them', async () => {
    await runYaml(`
web:
  url: ${baseUrl}
tasks:
  - name: noop
    flow:
      - sleep: 50
`);

    expect(received.length).toBeGreaterThan(0);
    expect(received.some((h) => h['x-custom-token'] !== undefined)).toBe(false);
  });
});
