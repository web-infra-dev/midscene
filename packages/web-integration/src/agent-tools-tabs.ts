import { z } from '@midscene/core';
import type { ToolDefinition } from '@midscene/shared/agent-tools/types';
import type { PuppeteerBrowserAgent } from './puppeteer';

export interface BrowserTabSummary {
  id: string;
  title: string;
  url: string;
  active: boolean;
}

// Keep Puppeteer's private target ID access in one place.
export function getTargetId(page: { target(): unknown }): string | undefined {
  return (page.target() as unknown as { _targetId?: string })._targetId;
}

export function requireTargetId(page: { target(): unknown }): string {
  const id = getTargetId(page);
  if (!id) throw new Error('Chrome did not expose a target ID for this page.');
  return id;
}

export function createTabTools(adapter: {
  list(): Promise<BrowserTabSummary[]>;
  select(id: string): Promise<void>;
}): ToolDefinition[] {
  return [
    {
      name: 'web_tabs',
      description:
        'List browser tabs with stable IDs, titles, URLs and the active tab.',
      schema: {},
      handler: async () => ({
        content: [{ type: 'text', text: JSON.stringify(await adapter.list()) }],
      }),
    },
    {
      name: 'web_switch-tab',
      description:
        'Switch to an existing tab by ID. Subsequent commands use this tab. Use tabs to find IDs.',
      schema: { id: z.string().min(1).describe('Tab ID returned by tabs') },
      handler: async ({ id }) => {
        await adapter.select(id as string);
        return { content: [{ type: 'text', text: `Switched to tab: ${id}` }] };
      },
    },
  ];
}

export function createPuppeteerTabTools(
  ensureAgent: () => Promise<PuppeteerBrowserAgent>,
  saveTarget: (id: string) => void | Promise<void>,
): ToolDefinition[] {
  return createTabTools({
    list: async () => {
      const agent = await ensureAgent();
      return Promise.all(
        (await agent.pages())
          .filter((page) => !page.isClosed())
          .map(async (page) => ({
            id: requireTargetId(page),
            title: await page.title(),
            url: page.url(),
            active: page === agent.activePage,
          })),
      );
    },
    select: async (id) => {
      const agent = await ensureAgent();
      const page = (await agent.pages()).find(
        (page) => getTargetId(page) === id && !page.isClosed(),
      );
      if (!page)
        throw new Error(
          `Tab ${id} does not exist or has closed. Run tabs again.`,
        );
      const previousPage = agent.activePage;
      await agent.setActivePage(page);
      try {
        await saveTarget(id);
      } catch (error) {
        try {
          await agent.setActivePage(previousPage);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            'Failed to save the selected tab and restore the previous page.',
          );
        }
        throw error;
      }
    },
  });
}
