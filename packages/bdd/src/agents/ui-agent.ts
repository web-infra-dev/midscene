/**
 * UI agent construction for @midscene/bdd.
 *
 * Exports: `createUiAgent`. A `WebUiTarget` config launches a Puppeteer agent
 * through '@midscene/web/puppeteer-agent-launcher' (lazily imported so unit
 * tests never pull in puppeteer); a factory function is invoked as-is.
 */
import {
  ERROR_PREFIX,
  type ResolvedBddConfig,
  type UiAgent,
  type WebUiTarget,
} from '../types';

export async function createUiAgent(
  config: ResolvedBddConfig,
): Promise<{ agent: UiAgent; cleanup?: () => Promise<void> }> {
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
    return created;
  }

  if (uiAgent && typeof uiAgent === 'object' && uiAgent.type === 'web') {
    return createWebUiAgent(uiAgent);
  }

  throw new Error(
    `${ERROR_PREFIX} uiAgent: expected a factory function or { type: 'web', url }`,
  );
}

async function createWebUiAgent(
  target: WebUiTarget,
): Promise<{ agent: UiAgent; cleanup: () => Promise<void> }> {
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
      generateReport: true,
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
