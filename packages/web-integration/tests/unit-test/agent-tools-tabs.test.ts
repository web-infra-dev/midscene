import {
  createPuppeteerTabTools,
  getTargetId,
  requireTargetId,
} from '@/agent-tools-tabs';
import type { PuppeteerBrowserAgent } from '@/puppeteer';
import { expect, it, rs } from '@rstest/core';

it('restores the previous live page when persisting a switch fails', async () => {
  const parent = {
    target: () => ({ _targetId: 'parent' }),
    isClosed: () => false,
  };
  const child = {
    target: () => ({ _targetId: 'child' }),
    isClosed: () => false,
  };
  const agent = {
    activePage: parent,
    pages: async () => [parent, child],
    setActivePage: rs.fn(async (page: typeof parent) => {
      agent.activePage = page;
    }),
  };
  const failure = new Error('disk full');
  const definitions = createPuppeteerTabTools(
    async () => agent as unknown as PuppeteerBrowserAgent,
    async () => {
      throw failure;
    },
  );
  const select = definitions.find((tool) => tool.name === 'web_switch-tab')!;
  await expect(select.handler({ id: 'child' })).rejects.toBe(failure);
  expect(agent.activePage).toBe(parent);
  expect(agent.setActivePage.mock.calls.map(([page]) => page)).toEqual([
    child,
    parent,
  ]);
});

it.each([undefined, null, {}, { _targetId: 42 }, { _targetId: '' }])(
  'rejects an unavailable or malformed Puppeteer target ID: %j',
  (target) => {
    const page = { target: () => target };
    expect(getTargetId(page)).toBeUndefined();
    expect(() => requireTargetId(page)).toThrow('target ID');
  },
);
