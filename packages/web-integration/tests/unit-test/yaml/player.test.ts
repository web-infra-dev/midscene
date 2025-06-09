import { join, resolve } from 'node:path';
import { assert } from '@midscene/shared/utils';

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { puppeteerAgentForTarget } from '@/puppeteer/agent-launcher';
import { ScriptPlayer, buildYaml, parseYamlScript } from '@/yaml';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';
import { describe, expect, test, vi } from 'vitest';

const serverRoot = join(__dirname, 'server_root');

const runYaml = async (yamlString: string, ignoreStatusAssertion = false) => {
  const script = parseYamlScript(yamlString);
  const statusUpdate = vi.fn();
  const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
    script,
    puppeteerAgentForTarget,
    statusUpdate,
  );
  await player.run();
  if (!ignoreStatusAssertion) {
    assert(
      player.status === 'done',
      player.errorInSetup?.message || 'unknown error',
    );
    expect(statusUpdate).toHaveBeenCalled();
  }
  return {
    player,
    statusUpdate,
  };
};

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

describe('yaml utils', () => {
  test('basic build && load', () => {
    const script = buildYaml(
      {
        url: 'https://bing.com',
        waitForNetworkIdle: {
          timeout: 1000,
          continueOnNetworkIdleError: true,
        },
      },
      [
        {
          name: 'search',
          flow: [
            {
              aiAction: 'type "hello" in search box, hit enter',
            },
          ],
        },
      ],
    );
    expect(script).toMatchSnapshot();

    const loadedScript = parseYamlScript(script);
    expect(loadedScript).toMatchSnapshot();
  });

  test('load error with filePath', () => {
    expect(() => {
      parseYamlScript(
        `
      target:
        a: 1
      `,
        'some_error_path',
      );
    }).toThrow(/some_error_path/);
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
    test('flush output even if assertion failed', async () => {
      const outputPath = `./midscene_run/output/${randomUUID()}.json`;
      const yamlString = `
      target:
        url: https://www.bing.com
        output: ${outputPath}
      tasks:
        - name: local page
          flow:
            - aiQuery: >
                the background color of the page, { color: 'white' | 'black' | 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'orange' | 'pink' | 'brown' | 'gray' | 'black' 
        - name: check content
          flow:
            - aiAssert: this is a food delivery service app
      `;
      await expect(async () => {
        await runYaml(yamlString);
      }).rejects.toThrow();

      expect(existsSync(outputPath)).toBe(true);
    });

    test('set output path correctly', async () => {
      const yamlString = `
      target:
        url: https://bing.com
        output: ./midscene_run/output/abc.json
      tasks:
        - name: check content
          flow:
            - aiQuery: title of the page
      `;
      const { player } = await runYaml(yamlString);
      expect(player.output).toBe(
        resolve(process.cwd(), './midscene_run/output/abc.json'),
      );

      const yamlString2 = `
      web:
        url: https://bing.com
        output: ./midscene_run/output/def.json
      tasks:
        - name: check content
          flow:
            - aiQuery: title of the page
      `;
      const { player: player2 } = await runYaml(yamlString2);
      expect(player2.output).toBe(
        resolve(process.cwd(), './midscene_run/output/def.json'),
      );
    });

    test('cookie', async () => {
      const yamlString = `
      target:
        url: http://httpbin.dev/cookies
        cookie: ./tests/unit-test/fixtures/cookie/httpbin.dev_cookies.json
      tasks:
        - name: check cookie
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
      tasks:
        - name: check content
          flow:
            - aiAssert: the response is "Hello, world!"
    `;

      expect(async () => {
        await runYaml(yamlString);
      }).rejects.toThrow(/TimeoutError/i);
    });

    test('stop on task error', async () => {
      const yamlString = `
      target:
        url: https://bing.com/
      tasks:
        - name: assert1
          flow:
            - aiAssert: this is a food delivery service app
        - name: assert2
          flow:
            - aiAssert: this is a search engine
      `;

      const { player } = await runYaml(yamlString, true);
      expect(player.status).toBe('error');
      expect(player.taskStatusList[0].status).toBe('error');
      expect(player.taskStatusList[1].status).toBe('init');
    });

    test('allow continue on task error', async () => {
      const yamlString = `
      target:
        url: https://bing.com/
      tasks:
        - name: assert1
          continueOnError: true
          flow:
            - aiAssert: this is a food delivery service app
        - name: assert2
          flow:
            - aiAssert: this is a search engine
      `;
      const { player } = await runYaml(yamlString, true);
      expect(player.status).toBe('done');
      expect(player.taskStatusList[0].status).toBe('error');
      expect(player.taskStatusList[1].status).toBe('done');
    });
  },
  60 * 1000,
);
