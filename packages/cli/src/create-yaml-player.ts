import { readFileSync } from 'node:fs';
import path, { basename, extname, join } from 'node:path';
import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { createServer } from 'http-server';

import assert from 'node:assert';
import { agentFromAdbDevice } from '@midscene/android';
import type {
  AgentOpt,
  FreeFn,
  MidsceneYamlScript,
  MidsceneYamlScriptAgentOpt,
  MidsceneYamlScriptEnv,
} from '@midscene/core';
import { createAgent } from '@midscene/core/agent';
import type { AbstractInterface } from '@midscene/core/device';
import { processCacheConfig } from '@midscene/core/utils';
import { agentFromWebDriverAgent } from '@midscene/ios';
import { getDebug } from '@midscene/shared/logger';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { puppeteerAgentForTarget } from '@midscene/web/puppeteer-agent-launcher';
import type { Browser } from 'puppeteer';

export interface SingleYamlExecutionResult {
  success: boolean;
  file: string;
  player: ScriptPlayer<MidsceneYamlScriptEnv>;
}

const debug = getDebug('create-yaml-player');

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

/**
 * Resolves the testId with proper priority handling.
 * Priority: CLI testId > YAML testId > fileName
 */
function resolveTestId(
  cliTestId: string | undefined,
  yamlTestId: string | undefined,
  fileName: string,
): string {
  return cliTestId ?? yamlTestId ?? fileName;
}

/**
 * Builds agent options by merging YAML agent config with processed cache and testId.
 * Handles the spread of agent options and ensures proper cache configuration.
 */
function buildAgentOptions(
  yamlAgent: MidsceneYamlScriptAgentOpt | undefined,
  preferenceTestId: string,
  fileName: string,
): Partial<AgentOpt> {
  const aiActContext = yamlAgent?.aiActContext ?? yamlAgent?.aiActionContext;

  return {
    ...(yamlAgent || {}),
    aiActContext,
    aiActionContext: aiActContext ?? yamlAgent?.aiActionContext,
    cache: processCacheConfig(yamlAgent?.cache, fileName),
    testId: preferenceTestId,
  };
}

export async function createYamlPlayer(
  file: string,
  script?: MidsceneYamlScript,
  options?: {
    headed?: boolean;
    keepWindow?: boolean;
    browser?: Browser;
    testId?: string;
  },
): Promise<ScriptPlayer<MidsceneYamlScriptEnv>> {
  const yamlScript =
    script || parseYamlScript(readFileSync(file, 'utf-8'), file);

  // Deep clone the script to avoid mutation issues when the same file is executed multiple times
  // This ensures each ScriptPlayer instance has its own independent copy of the YAML data
  const clonedYamlScript = structuredClone(yamlScript);

  const fileName = basename(file, extname(file));
  const preference = {
    headed: options?.headed,
    keepWindow: options?.keepWindow,
    // Priority: CLI testId > YAML testId > fileName
    testId: resolveTestId(
      options?.testId,
      clonedYamlScript.agent?.testId,
      fileName,
    ),
  };

  const player = new ScriptPlayer(
    clonedYamlScript,
    async () => {
      const freeFn: FreeFn[] = [];
      const webTarget = clonedYamlScript.web || clonedYamlScript.target;

      // Validate that only one target type is specified
      const targetCount = [
        typeof webTarget !== 'undefined',
        typeof clonedYamlScript.android !== 'undefined',
        typeof clonedYamlScript.ios !== 'undefined',
        typeof clonedYamlScript.interface !== 'undefined',
      ].filter(Boolean).length;

      if (targetCount > 1) {
        const specifiedTargets = [
          typeof webTarget !== 'undefined' ? 'web' : null,
          typeof clonedYamlScript.android !== 'undefined' ? 'android' : null,
          typeof clonedYamlScript.ios !== 'undefined' ? 'ios' : null,
          typeof clonedYamlScript.interface !== 'undefined'
            ? 'interface'
            : null,
        ].filter(Boolean);

        throw new Error(
          `Only one target type can be specified, but found multiple: ${specifiedTargets.join(', ')}. Please specify only one of: web, android, ios, or interface.`,
        );
      }

      // handle new web config
      if (typeof webTarget !== 'undefined') {
        if (typeof clonedYamlScript.target !== 'undefined') {
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
            {
              ...preference,
              ...buildAgentOptions(
                clonedYamlScript.agent,
                preference.testId,
                fileName,
              ),
            },
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
          webTarget.cookie ||
          webTarget.chromeArgs
        ) {
          console.warn(
            'puppeteer options (userAgent, viewportWidth, viewportHeight, viewportScale, waitForNetworkIdle, cookie, chromeArgs) are not supported in bridge mode. They will be ignored.',
          );
        }

        const agent = new AgentOverChromeBridge({
          closeNewTabsAfterDisconnect: webTarget.closeNewTabsAfterDisconnect,
          ...buildAgentOptions(
            clonedYamlScript.agent,
            preference.testId,
            fileName,
          ),
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
      if (typeof clonedYamlScript.android !== 'undefined') {
        const androidTarget = clonedYamlScript.android;
        const agent = await agentFromAdbDevice(androidTarget?.deviceId, {
          ...androidTarget, // Pass all Android config options
          ...buildAgentOptions(
            clonedYamlScript.agent,
            preference.testId,
            fileName,
          ),
        });

        if (androidTarget?.launch) {
          await agent.launch(androidTarget.launch);
        }

        freeFn.push({
          name: 'destroy_android_agent',
          fn: () => agent.destroy(),
        });

        return { agent, freeFn };
      }

      // handle iOS
      if (typeof clonedYamlScript.ios !== 'undefined') {
        const iosTarget = clonedYamlScript.ios;
        const agent = await agentFromWebDriverAgent({
          ...iosTarget, // Pass all iOS config options
          ...buildAgentOptions(
            clonedYamlScript.agent,
            preference.testId,
            fileName,
          ),
        });

        if (iosTarget?.launch) {
          await agent.launch(iosTarget.launch);
        }

        freeFn.push({
          name: 'destroy_ios_agent',
          fn: () => agent.destroy(),
        });

        return { agent, freeFn };
      }

      // handle general interface
      if (typeof clonedYamlScript.interface !== 'undefined') {
        const interfaceTarget = clonedYamlScript.interface;

        const moduleSpecifier = interfaceTarget.module;
        let finalModuleSpecifier: string;
        if (
          moduleSpecifier.startsWith('./') ||
          moduleSpecifier.startsWith('../') ||
          path.isAbsolute(moduleSpecifier)
        ) {
          const resolvedPath = join(process.cwd(), moduleSpecifier);
          finalModuleSpecifier = resolvedPath;
        } else {
          finalModuleSpecifier = moduleSpecifier;
        }

        // import the module dynamically
        debug(
          'importing module config',
          interfaceTarget.module,
          'with export config',
          interfaceTarget.export,
          'final module specifier',
          finalModuleSpecifier,
        );

        const importedModule = await import(finalModuleSpecifier);

        // get the specific export or use default export
        const DeviceClass = interfaceTarget.export
          ? importedModule[interfaceTarget.export]
          : importedModule.default || importedModule;

        debug('DeviceClass', DeviceClass, 'with param', interfaceTarget.param);

        // create device instance with parameters
        const device: AbstractInterface = new DeviceClass(
          interfaceTarget.param || {},
        );

        // create agent from device
        debug('creating agent from device', device);
        const agent = createAgent(
          device,
          buildAgentOptions(
            clonedYamlScript.agent,
            preference.testId,
            fileName,
          ),
        );

        freeFn.push({
          name: 'destroy_general_interface_agent',
          fn: () => {
            agent.destroy();
          },
        });

        return { agent, freeFn };
      }

      throw new Error(
        'No valid interface configuration found in the yaml script, should be either "web", "android", "ios", or "interface"',
      );
    },
    undefined,
    file,
  );

  return player;
}
