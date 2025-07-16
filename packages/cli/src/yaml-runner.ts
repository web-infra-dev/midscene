import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { ScriptPlayer, parseYamlScript } from '@midscene/web/yaml';
import { createServer } from 'http-server';

import assert from 'node:assert';
import { agentFromAdbDevice } from '@midscene/android';
import type { FreeFn, MidsceneYamlScript } from '@midscene/core';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { puppeteerAgentForTarget } from '@midscene/web/puppeteer-agent-launcher';
import type { Browser } from 'puppeteer';

export interface SingleYamlExecutionResult {
  success: boolean;
  file: string;
  player: ScriptPlayer<any>;
}

export const launchServer = async (
  dir: string,
): Promise<ReturnType<typeof createServer>> => {
  // https://github.com/http-party/http-server/blob/master/bin/http-server
  return new Promise((resolve) => {
    const server = createServer({
      root: dir,
    });
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
};

export async function createYamlPlayer(
  file: string,
  script?: MidsceneYamlScript,
  options?: {
    headed?: boolean;
    keepWindow?: boolean;
    browser?: Browser;
  },
): Promise<ScriptPlayer<any>> {
  const yamlScript =
    script || parseYamlScript(readFileSync(file, 'utf-8'), file);
  const fileName = basename(file, extname(file));
  const preference = {
    headed: options?.headed,
    keepWindow: options?.keepWindow,
    testId: fileName,
    cacheId: fileName,
  };

  const player = new ScriptPlayer(
    yamlScript,
    async () => {
      const freeFn: FreeFn[] = [];
      const webTarget = yamlScript.web || yamlScript.target;

      // handle new web config
      if (typeof webTarget !== 'undefined') {
        if (typeof yamlScript.target !== 'undefined') {
          console.warn(
            'target is deprecated, please use web instead. See https://midscenejs.com/automate-with-scripts-in-yaml for more information. Sorry for the inconvenience.',
          );
        }

        // launch local server if needed
        let localServer: Awaited<ReturnType<typeof launchServer>> | undefined;
        let urlToVisit: string | undefined;
        if (webTarget.serve) {
          assert(
            typeof webTarget.url === 'string',
            'url is required in serve mode',
          );
          localServer = await launchServer(webTarget.serve);
          const serverAddress = localServer.server.address();
          freeFn.push({
            name: 'local_server',
            fn: () => localServer?.server.close(),
          });
          if (webTarget.url.startsWith('/')) {
            urlToVisit = `http://${serverAddress?.address}:${serverAddress?.port}${webTarget.url}`;
          } else {
            urlToVisit = `http://${serverAddress?.address}:${serverAddress?.port}/${webTarget.url}`;
          }
          webTarget.url = urlToVisit;
        }

        if (!webTarget.bridgeMode) {
          // use puppeteer
          const { agent, freeFn: newFreeFn } = await puppeteerAgentForTarget(
            webTarget,
            preference,
            options?.browser,
          );
          freeFn.push(...newFreeFn);

          return { agent, freeFn };
        }
        assert(
          webTarget.bridgeMode === 'newTabWithUrl' ||
            webTarget.bridgeMode === 'currentTab',
          `bridgeMode config value must be either "newTabWithUrl" or "currentTab", but got ${webTarget.bridgeMode}`,
        );

        if (
          webTarget.userAgent ||
          webTarget.viewportWidth ||
          webTarget.viewportHeight ||
          webTarget.viewportScale ||
          webTarget.waitForNetworkIdle ||
          webTarget.cookie
        ) {
          console.warn(
            'puppeteer options (userAgent, viewportWidth, viewportHeight, viewportScale, waitForNetworkIdle, cookie) are not supported in bridge mode. They will be ignored.',
          );
        }

        const agent = new AgentOverChromeBridge({
          closeNewTabsAfterDisconnect: webTarget.closeNewTabsAfterDisconnect,
          cacheId: fileName,
        });

        if (webTarget.bridgeMode === 'newTabWithUrl') {
          await agent.connectNewTabWithUrl(webTarget.url);
        } else {
          if (webTarget.url) {
            console.warn(
              'url will be ignored in bridge mode with "currentTab"',
            );
          }
          await agent.connectCurrentTab();
        }
        freeFn.push({
          name: 'destroy_agent_over_chrome_bridge',
          fn: () => agent.destroy(),
        });
        return {
          agent,
          freeFn,
        };
      }

      // handle android
      if (typeof yamlScript.android !== 'undefined') {
        const androidTarget = yamlScript.android;
        const agent = await agentFromAdbDevice(androidTarget?.deviceId);

        if (androidTarget?.launch) {
          await agent.launch(androidTarget.launch);
        }

        freeFn.push({
          name: 'destroy_android_agent',
          fn: () => agent.destroy(),
        });

        return { agent, freeFn };
      }

      throw new Error(
        'No valid target configuration found in the yaml script, should be either "web" or "android"',
      );
    },
    undefined,
    file,
  );

  return player;
}
