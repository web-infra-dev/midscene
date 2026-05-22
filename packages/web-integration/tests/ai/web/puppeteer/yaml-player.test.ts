import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { puppeteerAgentForTarget } from '@/puppeteer/agent-launcher';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';
import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { assert, uuid } from '@midscene/shared/utils';
import { describe, expect, test, vi } from 'vitest';

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

describe(
  'YAML player - AI e2e',
  () => {
    test('flush output even if assertion failed', async () => {
      const outputPath = `./midscene_run/output/${uuid()}.json`;
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
        cookie: ./tests/ai/fixtures/cookie/httpbin.dev_cookies.json
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

      await expect(async () => {
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
