import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { ScriptPlayer, parseYamlScript } from '@midscene/web/yaml';
import { createServer } from 'http-server';
import {
  type MidsceneYamlFileContext,
  contextInfo,
  contextTaskListSummary,
  isTTY,
  spinnerInterval,
} from './printer';
import { TTYWindowRenderer } from './tty-renderer';

import assert from 'node:assert';
import type { FreeFn } from '@midscene/core';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { puppeteerAgentForTarget } from '@midscene/web/puppeteer';
export const launchServer = async (
  dir: string,
): Promise<ReturnType<typeof createServer>> => {
  // https://github.com/http-party/http-server/blob/master/bin/http-server
  return new Promise((resolve, reject) => {
    const server = createServer({
      root: dir,
    });
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
};

let ttyRenderer: TTYWindowRenderer | undefined;
export async function playYamlFiles(
  files: string[],
  options?: {
    headed?: boolean;
    keepWindow?: boolean;
  },
): Promise<boolean> {
  // prepare
  const fileContextList: MidsceneYamlFileContext[] = [];
  for (const file of files) {
    const script = parseYamlScript(readFileSync(file, 'utf-8'), file);
    const fileName = basename(file, extname(file));
    const preference = {
      headed: options?.headed,
      keepWindow: options?.keepWindow,
      testId: fileName,
    };
    const player = new ScriptPlayer(script, async (target) => {
      const freeFn: FreeFn[] = [];

      // launch local server if needed
      let localServer: Awaited<ReturnType<typeof launchServer>> | undefined;
      let urlToVisit: string | undefined;
      if (target.serve) {
        assert(typeof target.url === 'string', 'url is required in serve mode');
        localServer = await launchServer(target.serve);
        const serverAddress = localServer.server.address();
        freeFn.push({
          name: 'local_server',
          fn: () => localServer?.server.close(),
        });
        if (target.url.startsWith('/')) {
          urlToVisit = `http://${serverAddress?.address}:${serverAddress?.port}${target.url}`;
        } else {
          urlToVisit = `http://${serverAddress?.address}:${serverAddress?.port}/${target.url}`;
        }
        target.url = urlToVisit;
      }

      // puppeteer
      if (!target.bridgeMode) {
        const { agent, freeFn: newFreeFn } = await puppeteerAgentForTarget(
          target,
          preference,
        );
        freeFn.push(...newFreeFn);

        return { agent, freeFn };
      }

      // bridge mode
      assert(
        target.bridgeMode === 'newTabWithUrl' ||
          target.bridgeMode === 'currentTab',
        `bridgeMode config value must be either "newTabWithUrl" or "currentTab", but got ${target.bridgeMode}`,
      );

      if (
        target.userAgent ||
        target.viewportWidth ||
        target.viewportHeight ||
        target.viewportScale ||
        target.waitForNetworkIdle ||
        target.cookie
      ) {
        console.warn(
          'puppeteer options (userAgent, viewportWidth, viewportHeight, viewportScale, waitForNetworkIdle, cookie) are not supported in bridge mode, will be ignored',
        );
      }

      const agent = new AgentOverChromeBridge({
        destroyOptions: {
          closeTab: target.closeNewTabsAfterDisconnect,
        },
      });
      if (target.bridgeMode === 'newTabWithUrl') {
        await agent.connectNewTabWithUrl(target.url);
      } else {
        if (target.url) {
          console.warn('url will be ignored in bridge mode with "currentTab"');
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
    });
    fileContextList.push({ file, player });
  }

  // play
  if (isTTY) {
    const summaryContents = () => {
      const summary: string[] = [''];
      for (const context of fileContextList) {
        summary.push(
          contextTaskListSummary(context.player.taskStatusList, context),
        );
      }
      summary.push('');
      return summary;
    };
    ttyRenderer = new TTYWindowRenderer({
      outputStream: process.stdout,
      errorStream: process.stderr,
      getWindow: summaryContents,
      interval: spinnerInterval,
    });

    ttyRenderer.start();
    for (const context of fileContextList) {
      await context.player.run();
    }
    ttyRenderer.stop();
  } else {
    for (const context of fileContextList) {
      const { mergedText } = contextInfo(context);
      console.log(mergedText);
      await context.player.run();
      console.log(
        contextTaskListSummary(context.player.taskStatusList, context),
      );
    }
  }

  const ifFail = fileContextList.some((task) => task.player.status === 'error');
  return !ifFail;
}
