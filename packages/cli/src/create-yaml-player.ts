import { readFileSync } from 'node:fs';
import path, { basename, extname, join } from 'node:path';
import {
  ScriptPlayer,
  parseYamlScript,
  resolveWebTarget,
} from '@midscene/core/yaml';
import { createServer } from 'http-server';

import assert from 'node:assert';
import type {
  AgentOpt,
  FreeFn,
  MidsceneYamlScript,
  MidsceneYamlScriptAgentOpt,
  MidsceneYamlScriptEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { createAgent, getReportFileName } from '@midscene/core/agent';
import type { AbstractInterface, DeviceAction } from '@midscene/core/device';
import { defineAction, z } from '@midscene/core/device';
import { processCacheConfig } from '@midscene/core/utils';
import { getDebug } from '@midscene/shared/logger';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import {
  buildDownloadBehavior,
  puppeteerAgentForTarget,
} from '@midscene/web/puppeteer-agent-launcher';
import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer';

export interface SingleYamlExecutionResult {
  success: boolean;
  file: string;
  player: ScriptPlayer<MidsceneYamlScriptEnv>;
}

const debug = getDebug('create-yaml-player');

export interface ResolvedCustomActions {
  actions: DeviceAction<any>[];
  /**
   * Optional prompt guidance returned by the custom-actions module via its
   * optional `getPromptRoutingHints` export. Rendered verbatim in the
   * planning prompt. Empty string when the module did not provide hints.
   */
  promptHints: string;
}

/**
 * Resolves and loads project-provided custom DeviceActions from either:
 *   1. Env:  MIDSCENE_CUSTOM_ACTIONS_MODULE + MIDSCENE_CUSTOM_ACTIONS_CONFIG
 *   2. YAML: agent.customActionsModule + agent.customActionsConfig
 *
 * Contract of the loaded module:
 *   - Primary:   export function buildCustomActions(config): DeviceAction[]
 *   - Fallback:  export const buildCustomActions = buildArcDeviceActions (Arc alias)
 *   - Fallback:  default export of DeviceAction[] or build-function
 *   - Optional:  export function getPromptRoutingHints({ actions, config }): string
 *
 * Returns null when no module is configured.
 */
async function resolveCustomActions(
  yamlAgent:
    | (MidsceneYamlScriptAgentOpt & {
        customActionsModule?: string;
        customActionsConfig?: unknown;
      })
    | undefined,
  yamlFileDir: string,
): Promise<ResolvedCustomActions | null> {
  const envModule = process.env.MIDSCENE_CUSTOM_ACTIONS_MODULE;
  const envConfigRaw = process.env.MIDSCENE_CUSTOM_ACTIONS_CONFIG;
  const yamlModule = yamlAgent?.customActionsModule;
  const yamlConfig = yamlAgent?.customActionsConfig;

  const moduleRaw = yamlModule || envModule;
  if (!moduleRaw) {
    if (envModule) {
      debug(
        'env MIDSCENE_CUSTOM_ACTIONS_MODULE was set but empty string; skipping',
      );
    }
    return null;
  }

  const modulePath = path.isAbsolute(moduleRaw)
    ? moduleRaw
    : path.resolve(yamlFileDir, moduleRaw);
  let config: unknown;
  if (yamlConfig !== undefined) {
    config = yamlConfig;
  } else if (envConfigRaw?.trim()) {
    try {
      config = JSON.parse(envConfigRaw);
    } catch (err) {
      throw new Error(
        `MIDSCENE_CUSTOM_ACTIONS_CONFIG is not valid JSON: ${
          (err as Error).message
        }. raw=${envConfigRaw.slice(0, 200)}`,
      );
    }
  } else {
    config = {};
  }

  debug(
    'loading custom actions module',
    modulePath,
    'with config keys',
    typeof config === 'object' && config !== null
      ? Object.keys(config)
      : '(non-object)',
  );

  let mod: any;
  try {
    mod = await import(modulePath);
  } catch (err) {
    throw new Error(
      `Failed to load customActionsModule ${modulePath}: ${(err as Error).message}`,
      { cause: err },
    );
  }

  const build: unknown =
    mod.buildCustomActions ?? mod.buildArcDeviceActions ?? mod.default;
  const runtimeInjected = {
    defineAction,
    z,
  } as const;
  const configWithRuntime =
    typeof config === 'object' && config !== null
      ? { ...(config as Record<string, unknown>), runtime: runtimeInjected }
      : { runtime: runtimeInjected };
  const actions: DeviceAction<any>[] =
    typeof build === 'function'
      ? await build(configWithRuntime)
      : Array.isArray(build)
        ? build
        : Array.isArray(mod)
          ? mod
          : [];

  if (!Array.isArray(actions)) {
    throw new Error(
      `customActionsModule ${modulePath} did not return DeviceAction[] from buildCustomActions/buildArcDeviceActions/default export. Got: ${typeof actions}`,
    );
  }

  let promptHints = '';
  const hintsFn: unknown = mod.getPromptRoutingHints;
  if (typeof hintsFn === 'function') {
    try {
      const hintResult = await hintsFn({ actions, config });
      if (typeof hintResult === 'string') promptHints = hintResult;
    } catch (err) {
      console.warn(
        `[midscene] customActionsModule getPromptRoutingHints threw; ignoring hints. ${(err as Error).message}`,
      );
    }
  }

  debug(
    'loaded',
    actions.length,
    'custom actions from',
    modulePath,
    'with prompt hints length',
    promptHints.length,
  );
  return { actions, promptHints };
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

/**
 * Resolves reportFileName with proper priority handling.
 * Priority: YAML reportFileName > CLI testId (legacy) > YAML testId (legacy) > fileName
 * Explicit YAML reportFileName is treated as the exact output name. Generated
 * legacy fallbacks include a unique suffix to avoid overwriting.
 */
function resolveReportFileName(
  yamlReportFileName: string | undefined,
  cliTestId: string | undefined,
  yamlTestId: string | undefined,
  fileName: string,
): string {
  if (yamlReportFileName !== undefined) {
    return yamlReportFileName;
  }
  const baseName = cliTestId ?? yamlTestId ?? fileName;
  return getReportFileName(baseName);
}

/**
 * Builds agent options by merging YAML agent config with processed cache and report name.
 * Handles the spread of agent options and ensures proper cache configuration.
 */
function buildAgentOptions(
  yamlAgent: MidsceneYamlScriptAgentOpt | undefined,
  reportFileName: string,
  fileName: string,
): Partial<AgentOpt> {
  return {
    ...(yamlAgent || {}),
    cache: processCacheConfig(yamlAgent?.cache, fileName),
    reportFileName,
  };
}

export async function createYamlPlayer(
  file: string,
  script?: MidsceneYamlScript,
  options?: {
    headed?: boolean;
    keepWindow?: boolean;
    iosAuto?: boolean;
    browser?: Browser;
    page?: Page;
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
    reportFileName: resolveReportFileName(
      clonedYamlScript.agent?.reportFileName,
      options?.testId,
      clonedYamlScript.agent?.testId,
      fileName,
    ),
  };

  const player = new ScriptPlayer(
    clonedYamlScript,
    async () => {
      const freeFn: FreeFn[] = [];
      const resolvedWebTarget = resolveWebTarget(clonedYamlScript);
      const webTarget = resolvedWebTarget?.target as
        | MidsceneYamlScriptWebEnv
        | undefined;

      const yamlFileDir = path.dirname(path.resolve(file));
      const resolvedCustom = await resolveCustomActions(
        clonedYamlScript.agent as Parameters<typeof resolveCustomActions>[0],
        yamlFileDir,
      );
      const injectCustom = <T extends object>(
        opts: T,
      ): T & {
        customActions?: DeviceAction<any>[];
        customActionsPromptHints?: string;
      } => {
        if (!resolvedCustom || resolvedCustom.actions.length === 0) {
          return opts as T & {
            customActions?: DeviceAction<any>[];
            customActionsPromptHints?: string;
          };
        }
        const existing = (
          opts as unknown as { customActions?: DeviceAction<any>[] }
        ).customActions;
        const existingHints = (
          opts as unknown as { customActionsPromptHints?: string }
        ).customActionsPromptHints;
        return {
          ...opts,
          customActions: [...(existing || []), ...resolvedCustom.actions],
          customActionsPromptHints:
            existingHints && resolvedCustom.promptHints
              ? `${existingHints}\n${resolvedCustom.promptHints}`
              : (existingHints ?? resolvedCustom.promptHints),
        };
      };

      // Validate that only one target type is specified
      const targetCount = [
        typeof resolvedWebTarget !== 'undefined',
        typeof clonedYamlScript.android !== 'undefined',
        typeof clonedYamlScript.ios !== 'undefined',
        typeof clonedYamlScript.harmony !== 'undefined',
        typeof clonedYamlScript.computer !== 'undefined',
        typeof clonedYamlScript.interface !== 'undefined',
      ].filter(Boolean).length;

      if (targetCount > 1) {
        const specifiedTargets = [
          resolvedWebTarget?.source ?? null,
          typeof clonedYamlScript.android !== 'undefined' ? 'android' : null,
          typeof clonedYamlScript.ios !== 'undefined' ? 'ios' : null,
          typeof clonedYamlScript.harmony !== 'undefined' ? 'harmony' : null,
          typeof clonedYamlScript.computer !== 'undefined' ? 'computer' : null,
          typeof clonedYamlScript.interface !== 'undefined'
            ? 'interface'
            : null,
        ].filter(Boolean);

        throw new Error(
          `Only one target type can be specified, but found multiple: ${specifiedTargets.join(', ')}. Please specify only one of: page, browser, web, android, ios, harmony, computer, or interface.`,
        );
      }

      // handle new web config
      if (typeof webTarget !== 'undefined') {
        if (resolvedWebTarget?.source === 'target') {
          console.warn(
            'target is deprecated, please use page or browser instead. See https://midscenejs.com/automate-with-scripts-in-yaml for more information. Sorry for the inconvenience.',
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

        // Validate: cdpEndpoint and bridgeMode are mutually exclusive
        if (webTarget.cdpEndpoint && webTarget.bridgeMode) {
          throw new Error(
            'cdpEndpoint and bridgeMode are mutually exclusive. Please specify only one.',
          );
        }

        if (webTarget.mode === 'browser' && webTarget.bridgeMode) {
          throw new Error(
            '[midscene] browser mode does not support bridgeMode. Use page: or web.mode: page for bridge mode.',
          );
        }

        // CDP mode: connect to an existing browser via Chrome DevTools Protocol
        if (webTarget.cdpEndpoint) {
          // Use the shared browser from batch-runner if available (shareBrowserContext),
          // otherwise connect via CDP endpoint
          const cdpBrowser =
            options?.browser ??
            (await puppeteer.connect({
              browserWSEndpoint: webTarget.cdpEndpoint,
              defaultViewport: null,
              downloadBehavior: buildDownloadBehavior(webTarget.downloadPath),
            }));

          // Warn about options that don't apply to an already-running browser
          if (webTarget.chromeArgs) {
            console.warn(
              'chromeArgs are not supported in CDP mode (browser is already running). They will be ignored.',
            );
          }

          // Reuse puppeteerAgentForTarget which handles page setup (userAgent, viewport,
          // cookie, waitForNetworkIdle, etc.) — pass the CDP browser as the browser param
          const { agent, freeFn: newFreeFn } = await puppeteerAgentForTarget(
            webTarget,
            injectCustom({
              ...preference,
              ...buildAgentOptions(
                clonedYamlScript.agent,
                preference.reportFileName,
                fileName,
              ),
            }),
            cdpBrowser as Browser,
            options?.page,
          );

          // Replace the default browser close with disconnect for CDP
          const cleanFreeFn = newFreeFn.filter(
            (f) => f.name !== 'puppeteer_browser',
          );
          if (!options?.browser) {
            // Only add disconnect if we created the connection (not shared from batch-runner)
            cleanFreeFn.push({
              name: 'cdp_browser_disconnect',
              fn: () => cdpBrowser.disconnect(),
            });
          }
          freeFn.push(...cleanFreeFn);

          return { agent, freeFn };
        }

        if (!webTarget.bridgeMode) {
          // use puppeteer
          const { agent, freeFn: newFreeFn } = await puppeteerAgentForTarget(
            webTarget,
            injectCustom({
              ...preference,
              ...buildAgentOptions(
                clonedYamlScript.agent,
                preference.reportFileName,
                fileName,
              ),
            }),
            options?.browser,
            options?.page,
          );
          freeFn.push(...newFreeFn);

          return { agent, freeFn };
        }
        assert(
          webTarget.bridgeMode === 'newTabWithUrl' ||
            webTarget.bridgeMode === 'currentTab',
          `bridgeMode config value must be either "newTabWithUrl" or "currentTab", but got ${webTarget.bridgeMode}`,
        );

        const bridgeUnsupportedKeys: (keyof MidsceneYamlScriptWebEnv)[] = [
          'userAgent',
          'viewportWidth',
          'viewportHeight',
          'deviceScaleFactor',
          'waitForNetworkIdle',
          'cookie',
          'extraHTTPHeaders',
          'downloadPath',
          'chromeArgs',
        ];
        const ignoredKeys = bridgeUnsupportedKeys.filter(
          (key) => webTarget[key] != null,
        );
        if (ignoredKeys.length > 0) {
          console.warn(
            `puppeteer options (${ignoredKeys.join(', ')}) are not supported in bridge mode. They will be ignored.`,
          );
        }

        const agent = new AgentOverChromeBridge({
          closeNewTabsAfterDisconnect: webTarget.closeNewTabsAfterDisconnect,
          closeConflictServer: true,
          ...buildAgentOptions(
            clonedYamlScript.agent,
            preference.reportFileName,
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
        const { agentFromAdbDevice } = await import('@midscene/android');
        const agent = await agentFromAdbDevice(
          androidTarget?.deviceId,
          injectCustom({
            ...androidTarget, // Pass all Android config options
            ...buildAgentOptions(
              clonedYamlScript.agent,
              preference.reportFileName,
              fileName,
            ),
          }),
        );

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
        const { agentFromIOSAuto, agentFromWebDriverAgent } = await import(
          '@midscene/ios'
        );
        const agentOptions = injectCustom({
          ...iosTarget, // Pass all iOS config options
          ...buildAgentOptions(
            clonedYamlScript.agent,
            preference.reportFileName,
            fileName,
          ),
        });
        const useIOSAuto =
          options?.iosAuto === true || iosTarget.iosAuto === true;
        const agent = useIOSAuto
          ? await agentFromIOSAuto(agentOptions)
          : await agentFromWebDriverAgent(agentOptions);

        if (iosTarget?.launch) {
          await agent.launch(iosTarget.launch);
        }

        freeFn.push({
          name: 'destroy_ios_agent',
          fn: () => agent.destroy(),
        });

        return { agent, freeFn };
      }

      // handle harmony
      if (typeof clonedYamlScript.harmony !== 'undefined') {
        const harmonyTarget = clonedYamlScript.harmony;
        const { agentFromHdcDevice } = await import('@midscene/harmony');
        const agent = await agentFromHdcDevice(
          harmonyTarget?.deviceId,
          injectCustom({
            ...harmonyTarget, // Pass all HarmonyOS config options
            ...buildAgentOptions(
              clonedYamlScript.agent,
              preference.reportFileName,
              fileName,
            ),
          }),
        );

        if (harmonyTarget?.launch) {
          await agent.launch(harmonyTarget.launch);
        }

        freeFn.push({
          name: 'destroy_harmony_agent',
          fn: () => agent.destroy(),
        });

        return { agent, freeFn };
      }

      // handle computer
      if (typeof clonedYamlScript.computer !== 'undefined') {
        const computerTarget = clonedYamlScript.computer;
        const { agentForComputer } = await import('@midscene/computer');
        const agent = await agentForComputer(
          injectCustom({
            ...computerTarget,
            ...buildAgentOptions(
              clonedYamlScript.agent,
              preference.reportFileName,
              fileName,
            ),
          }),
        );

        freeFn.push({
          name: 'destroy_computer_agent',
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
        const userParam = interfaceTarget.param || {};
        const deviceParam =
          resolvedCustom &&
          resolvedCustom.actions.length > 0 &&
          typeof userParam === 'object' &&
          userParam !== null &&
          !Array.isArray(userParam)
            ? {
                ...(userParam as Record<string, unknown>),
                customActions: [
                  ...(((userParam as Record<string, unknown>).customActions as
                    | DeviceAction<any>[]
                    | undefined) || []),
                  ...resolvedCustom.actions,
                ],
              }
            : userParam;
        const device: AbstractInterface = new DeviceClass(deviceParam);

        // create agent from device
        debug('creating agent from device', device);
        const agent = createAgent(
          device,
          injectCustom(
            buildAgentOptions(
              clonedYamlScript.agent,
              preference.reportFileName,
              fileName,
            ),
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
        'No valid interface configuration found in the yaml script, should be either "web", "android", "ios", "harmony", "computer", or "interface"',
      );
    },
    undefined,
    file,
  );

  return player;
}
