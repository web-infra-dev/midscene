import { join } from 'node:path';
import { ScriptPlayer, launchServer, loadYamlScript } from '@/yaml-player';
import { assert, describe, expect, test, vi } from 'vitest';

const runYaml = async (yamlString: string) => {
  const script = loadYamlScript(yamlString);
  const player = new ScriptPlayer(script);
  await player.play();
  assert(player.status === 'done', player.error?.message || 'unknown error');
};

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

const serverRoot = join(__dirname, 'server_root');
describe('yaml', () => {
  test('basic load', () => {
    const script = loadYamlScript(`
      target:
        url: https://www.baidu.com
        waitForNetworkIdle:
          timeout: 1000
          continueOnNetworkIdleError: true
      flow:
        - action: type 'hello' in search box, hit enter
    `);

    expect(script).toMatchSnapshot();
  });

  test('load error with filePath', () => {
    expect(() => {
      loadYamlScript(
        `
      target:
        a: 1
      `,
        'some_error_path',
      );
    }).toThrow(/some_error_path/);
  });

  test('launch server', async () => {
    const serverResult = await launchServer(serverRoot);
    expect(serverResult).toBeDefined();

    const serverAddress = serverResult.server.address();
    const staticServerUrl = `http://${serverAddress?.address}:${serverAddress?.port}`;

    const contents = await fetch(`${staticServerUrl}/index.html`);
    expect(contents.status).toBe(200);

    await serverResult.server.close();
  });

  test('player - bad params', async () => {
    expect(async () => {
      await runYaml(`
          target:
            serve: ${serverRoot}
        `);
    }).rejects.toThrow();

    expect(async () => {
      await runYaml(`
          target:
            serve: ${serverRoot}
            viewportWidth: 0
        `);
    }).rejects.toThrow();
  });
});

describe.skipIf(!shouldRunAITest)(
  'player - e2e',
  () => {
    test('local server', async () => {
      const yamlString = `
      target:
        serve: ${serverRoot}
        url: index.html
        viewportWidth: 300
        viewportHeight: 500
      flow:
        - aiAssert: the content title is "My App"
    `;

      await runYaml(yamlString);
    });

    test('local server - assertion failed', async () => {
      const yamlString = `
      target:
        serve: ${serverRoot}
        url: index.html
        viewportWidth: 300
        viewportHeight: 500
      flow:
        - aiAssert: it shows the width is 888
      `;

      expect(async () => {
        await runYaml(yamlString);
      }).rejects.toThrow();
    });

    test('cookie', async () => {
      const yamlString = `
      target:
        url: http://httpbin.dev/cookies
        cookie: ./tests/fixture/httpbin.dev_cookies.json
      flow:
        - aiAssert: the value of midscene_foo is "bar"
    `;
      await runYaml(yamlString);
    });

    test('online server - lazy response', async () => {
      const yamlString = `
      target:
        url: https://httpbin.org/delay/60000
        waitForNetworkIdle:
          timeout: 10
          continueOnNetworkIdleError: false
      flow:
        - aiAssert: the response is "Hello, world!"
    `;

      expect(async () => {
        await runYaml(yamlString);
      }).rejects.toThrow(/TimeoutError/i);
    });
  },
  60 * 1000,
);
