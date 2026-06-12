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
import { getDebug } from '@midscene/shared/logger';
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
    // Unknown types are rejected by config validation; this only guards
    // unvalidated programmatic configs.
    default: {
      const unreachable: never = uiAgent;
      throw new Error(
        `${ERROR_PREFIX} unhandled uiAgent.type '${String(
          (unreachable as { type?: unknown }).type,
        )}' — valid types: ${UI_TARGET_TYPES.join(', ')}`,
      );
    }
  }
}

/**
 * Lazy platform import with a pointed error when the optional peer
 * dependency `@midscene/<targetType>` is not installed. Only genuine
 * resolution failures OF THAT PACKAGE get the install hint — an installed
 * package that fails to load (broken transitive dep, native build failure)
 * rethrows untouched so the real error stays the headline.
 */
export async function importPlatformPackage<T>(
  targetType: string,
  importer: () => Promise<T>,
): Promise<T> {
  const packageName = `@midscene/${targetType}`;
  try {
    return await importer();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // The QUOTED name is what Node puts around the unresolvable specifier
    // ("Cannot find package '@midscene/x' …"); a transitive dep's failure
    // only mentions our package unquoted inside the "imported from" path.
    const notFound =
      (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') &&
      error instanceof Error &&
      error.message.includes(`'${packageName}'`);
    if (!notFound) {
      throw error;
    }
    throw new Error(
      `${ERROR_PREFIX} uiAgent type '${targetType}' requires the optional peer dependency '${packageName}' — install it (e.g. \`pnpm add -D ${packageName}\`).`,
      { cause: error },
    );
  }
}

async function createWebUiAgent(
  target: WebUiTarget,
  options: UiAgentOptions,
): Promise<CreatedUiAgent> {
  const { puppeteerAgentForTarget } = await import(
    '@midscene/web/puppeteer-agent-launcher'
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
  getDebug('bdd:ui-agent')(
    `interface module '${target.module}' resolved to '${specifier}'`,
  );

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

  // Lazy not because core is optional (it's a hard dep) but to keep the
  // unit-test mock surface small and module load cheap for non-interface
  // targets.
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
