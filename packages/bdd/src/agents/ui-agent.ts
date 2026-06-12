/**
 * UI agent construction for @midscene/bdd.
 *
 * Exports: `createUiAgent`. A declarative `UiTarget` config switches on
 * `type` and builds the matching platform agent; a factory function is
 * invoked as-is. Every platform module is imported LAZILY so this package
 * never hard-depends on puppeteer or the device toolchains — android, ios,
 * harmony and computer are optional peer dependencies, and a missing one
 * fails with the package name to install. `config.uiAgentOptions` (the yaml
 * `agent:` vocabulary) is threaded into every constructor; `generateReport`
 * defaults to true.
 */
import path from 'node:path';
import {
  type AndroidUiTarget,
  type ComputerUiTarget,
  ERROR_PREFIX,
  type HarmonyUiTarget,
  type IOSUiTarget,
  type InterfaceUiTarget,
  type ResolvedBddConfig,
  UI_TARGET_TYPES,
  type UiAgent,
  type UiAgentOptions,
  type WebUiTarget,
} from '../types';

export interface CreatedUiAgent {
  agent: UiAgent;
  cleanup?: () => Promise<void>;
}

export async function createUiAgent(
  config: ResolvedBddConfig,
): Promise<CreatedUiAgent> {
  const { uiAgent } = config;

  if (typeof uiAgent === 'function') {
    const created = await uiAgent();
    if (
      !created ||
      typeof created !== 'object' ||
      !(created as { agent?: unknown }).agent
    ) {
      throw new Error(
        `${ERROR_PREFIX} uiAgent factory must resolve to { agent, cleanup? }, got: ${String(
          created,
        )}`,
      );
    }
    const cleanup = (created as { cleanup?: unknown }).cleanup;
    if (cleanup !== undefined && typeof cleanup !== 'function') {
      // Fail fast: a non-function cleanup would otherwise throw during
      // teardown and skip agent.destroy(), leaking a browser per scenario.
      throw new Error(
        `${ERROR_PREFIX} uiAgent factory: cleanup must be a function when provided, got ${typeof cleanup}`,
      );
    }
    return created;
  }

  if (!uiAgent || typeof uiAgent !== 'object') {
    throw new Error(
      `${ERROR_PREFIX} uiAgent: expected a factory function or a { type: ... } target object`,
    );
  }

  const options: UiAgentOptions = {
    generateReport: true,
    ...config.uiAgentOptions,
  };

  switch (uiAgent.type) {
    case 'web':
      return createWebUiAgent(uiAgent, options);
    case 'android':
      return createAndroidUiAgent(uiAgent, options);
    case 'ios':
      return createIOSUiAgent(uiAgent, options);
    case 'harmony':
      return createHarmonyUiAgent(uiAgent, options);
    case 'computer':
      return createComputerUiAgent(uiAgent, options);
    case 'interface':
      return createInterfaceUiAgent(uiAgent, options, config.baseDir);
    default: {
      const unreachable: never = uiAgent;
      throw new Error(
        `${ERROR_PREFIX} uiAgent.type '${String(
          (unreachable as { type?: unknown }).type,
        )}' is unknown — valid types: ${UI_TARGET_TYPES.join(', ')}`,
      );
    }
  }
}

/**
 * Lazy platform import with a pointed error when the optional peer
 * dependency is not installed.
 */
async function importPlatformPackage<T>(
  packageName: string,
  targetType: string,
  importer: () => Promise<T>,
): Promise<T> {
  try {
    return await importer();
  } catch (error) {
    throw new Error(
      `${ERROR_PREFIX} uiAgent type '${targetType}' requires the optional peer dependency '${packageName}' — install it (e.g. \`pnpm add -D ${packageName}\`). Original error: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

async function createWebUiAgent(
  target: WebUiTarget,
  options: UiAgentOptions,
): Promise<CreatedUiAgent> {
  const { puppeteerAgentForTarget } = await importPlatformPackage(
    '@midscene/web',
    'web',
    () => import('@midscene/web/puppeteer-agent-launcher'),
  );

  const { agent, freeFn } = await puppeteerAgentForTarget(
    {
      url: target.url,
      viewportWidth: target.viewportWidth,
      viewportHeight: target.viewportHeight,
      userAgent: target.userAgent,
    },
    {
      headed: !!target.headed,
      keepWindow: false,
      ...options,
    },
  );

  const cleanup = async () => {
    // Reverse order: the launcher pushes browser teardown before agent
    // teardown, but the agent must be destroyed before its browser closes.
    for (const free of [...freeFn].reverse()) {
      await free.fn();
    }
  };

  return { agent: agent as unknown as UiAgent, cleanup };
}

async function createAndroidUiAgent(
  target: AndroidUiTarget,
  options: UiAgentOptions,
): Promise<CreatedUiAgent> {
  const { agentFromAdbDevice } = await importPlatformPackage(
    '@midscene/android',
    'android',
    () => import('@midscene/android'),
  );

  const {
    type: _type,
    scope: _scope,
    deviceId,
    launch,
    ...deviceOpts
  } = target;
  const agent = await agentFromAdbDevice(deviceId, {
    ...deviceOpts,
    ...options,
  });
  if (launch) {
    await agent.launch(launch);
  }
  return withDestroyCleanup(agent);
}

async function createIOSUiAgent(
  target: IOSUiTarget,
  options: UiAgentOptions,
): Promise<CreatedUiAgent> {
  const { agentFromWebDriverAgent } = await importPlatformPackage(
    '@midscene/ios',
    'ios',
    () => import('@midscene/ios'),
  );

  const { type: _type, scope: _scope, launch, ...deviceOpts } = target;
  const agent = await agentFromWebDriverAgent({
    ...deviceOpts,
    ...options,
  });
  if (launch) {
    await agent.launch(launch);
  }
  return withDestroyCleanup(agent);
}

async function createHarmonyUiAgent(
  target: HarmonyUiTarget,
  options: UiAgentOptions,
): Promise<CreatedUiAgent> {
  const { agentFromHdcDevice } = await importPlatformPackage(
    '@midscene/harmony',
    'harmony',
    () => import('@midscene/harmony'),
  );

  const {
    type: _type,
    scope: _scope,
    deviceId,
    launch,
    ...deviceOpts
  } = target;
  const agent = await agentFromHdcDevice(deviceId, {
    ...deviceOpts,
    ...options,
  });
  if (launch) {
    await agent.launch(launch);
  }
  return withDestroyCleanup(agent);
}

async function createComputerUiAgent(
  target: ComputerUiTarget,
  options: UiAgentOptions,
): Promise<CreatedUiAgent> {
  const { agentForComputer } = await importPlatformPackage(
    '@midscene/computer',
    'computer',
    () => import('@midscene/computer'),
  );

  const { type: _type, scope: _scope, ...deviceOpts } = target;
  const agent = await agentForComputer({
    ...deviceOpts,
    ...options,
  });
  return withDestroyCleanup(agent);
}

async function createInterfaceUiAgent(
  target: InterfaceUiTarget,
  options: UiAgentOptions,
  baseDir: string,
): Promise<CreatedUiAgent> {
  // Relative specifiers resolve against the config file's directory (NOT
  // process.cwd()) so the config is portable regardless of where cucumber
  // is launched from.
  const specifier =
    target.module.startsWith('./') ||
    target.module.startsWith('../') ||
    path.isAbsolute(target.module)
      ? path.resolve(baseDir, target.module)
      : target.module;

  let importedModule: Record<string, unknown>;
  try {
    importedModule = await import(specifier);
  } catch (error) {
    throw new Error(
      `${ERROR_PREFIX} uiAgent interface module '${target.module}' (resolved: '${specifier}') could not be imported: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  const DeviceClass = target.export
    ? importedModule[target.export]
    : (importedModule.default ?? importedModule);
  if (typeof DeviceClass !== 'function') {
    throw new Error(
      `${ERROR_PREFIX} uiAgent interface module '${target.module}' did not provide a constructable ${
        target.export ? `export '${target.export}'` : 'default export'
      }, got ${typeof DeviceClass}`,
    );
  }

  const { createAgent } = await import('@midscene/core/agent');
  const device = new (
    DeviceClass as new (
      param: Record<string, unknown>,
    ) => Parameters<typeof createAgent>[0]
  )(target.param ?? {});
  const agent = createAgent(device, options);
  return withDestroyCleanup(agent);
}

function withDestroyCleanup(agent: {
  destroy: () => Promise<void> | void;
}): CreatedUiAgent {
  return {
    agent: agent as unknown as UiAgent,
    cleanup: async () => {
      await agent.destroy();
    },
  };
}
