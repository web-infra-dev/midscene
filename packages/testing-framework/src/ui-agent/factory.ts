/**
 * UI Agent creation (RFC §2.1).
 *
 * `config.uiAgent` is a union: an object (config-style) or a factory function
 * (programmatic). This module resolves both into a live Midscene UI Agent plus
 * an optional cleanup hook.
 */
import type { Agent } from '@midscene/core/agent';
import type { UIAgent, UIAgentConfig, UIAgentOptions } from '../config/types';

export interface ResolvedUIAgent {
  agent: Agent;
  cleanup?: () => Promise<void>;
}

export async function createUIAgent(
  uiAgent: UIAgent,
  uiAgentOptions: UIAgentOptions | undefined,
  env: NodeJS.ProcessEnv,
): Promise<ResolvedUIAgent> {
  if (typeof uiAgent === 'function') {
    // Programmatic factory: the project fully controls construction.
    const result = await uiAgent({ uiAgentOptions, env });
    if (!result?.agent) {
      throw new Error(
        '[midscene] The uiAgent factory must resolve to `{ agent }`.',
      );
    }
    return { agent: result.agent, cleanup: result.cleanup };
  }

  return createFromConfig(uiAgent, uiAgentOptions);
}

async function createFromConfig(
  config: UIAgentConfig,
  uiAgentOptions: UIAgentOptions | undefined,
): Promise<ResolvedUIAgent> {
  switch (config.type) {
    case 'web':
      return createWebAgent(config, uiAgentOptions);
    case 'android':
      return createAndroidAgent(config, uiAgentOptions);
    case 'ios':
    case 'computer':
      throw new Error(
        `[midscene] uiAgent.type "${config.type}" is not yet supported by the config-style factory. Provide a \`uiAgent\` factory function instead.`,
      );
    default:
      throw new Error(
        `[midscene] Unknown uiAgent.type "${(config as UIAgentConfig).type}".`,
      );
  }
}

async function createWebAgent(
  config: UIAgentConfig,
  uiAgentOptions: UIAgentOptions | undefined,
): Promise<ResolvedUIAgent> {
  const options = (config.options ?? {}) as Record<string, unknown>;
  if (!options.url) {
    throw new Error('[midscene] uiAgent.type "web" requires `options.url`.');
  }

  let mod: typeof import('@midscene/web/puppeteer-agent-launcher');
  try {
    mod = await import('@midscene/web/puppeteer-agent-launcher');
  } catch (err) {
    throw new Error(
      `[midscene] Could not load @midscene/web for the web UI Agent. Install \`@midscene/web\` and \`puppeteer\`. Original error: ${(err as Error).message}`,
    );
  }

  const { agent, freeFn } = await mod.puppeteerAgentForTarget(
    options as unknown as Parameters<typeof mod.puppeteerAgentForTarget>[0],
    uiAgentOptions as unknown as Parameters<
      typeof mod.puppeteerAgentForTarget
    >[1],
  );

  return {
    agent: agent as unknown as Agent,
    cleanup: async () => {
      for (const free of freeFn) {
        try {
          await free.fn();
        } catch {
          // best-effort cleanup
        }
      }
    },
  };
}

async function createAndroidAgent(
  config: UIAgentConfig,
  uiAgentOptions: UIAgentOptions | undefined,
): Promise<ResolvedUIAgent> {
  const options = (config.options ?? {}) as Record<string, unknown>;
  // `@midscene/android` is an optional peer; load it loosely so the framework
  // does not hard-depend on it.
  const spec = '@midscene/android';
  let mod: {
    agentFromAdbDevice: (
      deviceId?: string,
      opts?: Record<string, unknown>,
    ) => Promise<Agent>;
  };
  try {
    mod = (await import(spec)) as typeof mod;
  } catch (err) {
    throw new Error(
      `[midscene] Could not load @midscene/android for the android UI Agent. Original error: ${(err as Error).message}`,
    );
  }

  const deviceId = options.deviceId as string | undefined;
  const agent = await mod.agentFromAdbDevice(deviceId, {
    ...(uiAgentOptions as object),
    ...options,
  });

  return {
    agent,
    cleanup: async () => {
      await agent.destroy?.();
    },
  };
}
