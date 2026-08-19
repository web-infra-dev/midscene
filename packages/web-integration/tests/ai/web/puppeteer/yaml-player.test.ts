import { puppeteerAgentForTarget } from '@/puppeteer/agent-launcher';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';
import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { assert } from '@midscene/shared/utils';
import { describe, expect, rs, test } from '@rstest/core';

const runYaml = async (yamlString: string, ignoreStatusAssertion = false) => {
  const script = parseYamlScript(yamlString);
  const statusUpdate = rs.fn();
  const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
    script,
    puppeteerAgentForTarget,
    statusUpdate,
  );
  await player.run();
  if (!ignoreStatusAssertion) {
    const taskError = player.taskStatusList.find(
      (taskStatus) => taskStatus.status === 'error',
    )?.error;
    assert(
      player.status === 'done',
      player.errorInSetup?.message ||
        taskError?.message ||
        `YAML player ended with status "${player.status}"`,
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
  120 * 1000,
);
