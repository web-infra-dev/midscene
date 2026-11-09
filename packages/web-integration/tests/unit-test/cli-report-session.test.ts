import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebMidsceneTools } from '@/agent-tools';
import { WebCdpMidsceneTools } from '@/agent-tools-cdp';
import { WebPuppeteerMidsceneTools } from '@/agent-tools-puppeteer';
import { AgentOverChromeBridge } from '@/bridge-mode';
import { PuppeteerBrowserAgent } from '@/puppeteer';
import { setMidsceneRunDir } from '@midscene/shared/common';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import puppeteer from 'puppeteer-core';

rs.mock('@/puppeteer', () => ({ PuppeteerBrowserAgent: rs.fn() }));
rs.mock('@/bridge-mode', () => ({ AgentOverChromeBridge: rs.fn() }));
rs.mock('puppeteer-core', () => ({ default: { connect: rs.fn() } }));
rs.mock('@/cdp-proxy-manager', () => ({
  getProxyEndpoint: rs.fn().mockResolvedValue('ws://fixture.invalid'),
}));
rs.mock('@/cdp-target-store', () => ({
  readSavedTargetId: rs.fn().mockReturnValue(null),
  saveTargetId: rs.fn(),
  cleanupTargetIdFile: rs.fn(),
}));

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
afterEach(() => {
  rs.restoreAllMocks();
});

describe('Web CLI report session wiring', () => {
  it.each(['puppeteer', 'cdp', 'bridge'] as const)(
    'reuses the report across %s tool instances and rotates on connect',
    async (mode) => {
      const root = mkdtempSync(join(tmpdir(), 'web-report-session-'));
      setMidsceneRunDir(root);
      const page = {
        url: () => 'https://fixture.invalid',
        target: () => ({ _targetId: 'fixture-tab' }),
        isClosed: () => false,
        bringToFront: rs.fn().mockResolvedValue(undefined),
      };
      const agent = {
        activePage: page,
        page: { screenshotBase64: rs.fn().mockResolvedValue(png) },
        aiAction: rs.fn().mockResolvedValue(undefined),
        connectCurrentTab: rs.fn().mockResolvedValue(undefined),
        destroy: rs.fn().mockResolvedValue(undefined),
      };
      rs.mocked(PuppeteerBrowserAgent).mockImplementation(() => agent as any);
      rs.mocked(AgentOverChromeBridge).mockImplementation(() => agent as any);
      const browser = { pages: async () => [page], disconnect: rs.fn() };
      rs.mocked(puppeteer.connect).mockResolvedValue(browser as any);
      const factory =
        mode === 'bridge'
          ? rs.mocked(AgentOverChromeBridge)
          : rs.mocked(PuppeteerBrowserAgent);
      factory.mockClear();
      const call = async (command: string) => {
        const tools =
          mode === 'bridge'
            ? new WebMidsceneTools()
            : mode === 'cdp'
              ? new WebCdpMidsceneTools('ws://fixture.invalid')
              : new WebPuppeteerMidsceneTools(undefined, {
                  persistence: { endpointFile: join(root, 'endpoint') },
                });
        if (tools instanceof WebPuppeteerMidsceneTools) {
          // Stub browser transport only; exercise the actual Agent construction.
          const manager = (tools as any).browserManager;
          rs.spyOn(manager, 'getOrLaunch').mockResolvedValue({
            browser,
            reused: true,
          });
          rs.spyOn(manager, 'readSavedTargetId').mockResolvedValue(null);
          rs.spyOn(manager, 'saveTargetId').mockResolvedValue(undefined);
        }
        await tools.initTools();
        try {
          await tools
            .getToolDefinitions()
            .find((tool) => tool.name === command)!
            .handler({ prompt: 'continue recording' });
        } finally {
          await tools.destroy();
        }
        const args = factory.mock.calls.at(-1)!;
        return (mode === 'bridge' ? args[0] : args[2]) as {
          reportFileName: string;
          reportAttributes: Record<string, string>;
        };
      };
      try {
        const first = await call('web_connect');
        expect(first).toMatchObject({
          reportFileName: expect.stringContaining('midscene-web'),
          reportAttributes: { 'data-group-id': first.reportFileName },
        });
        expect(await call('act')).toEqual(first);
        const next = await call('web_connect');
        expect(next.reportFileName).not.toBe(first.reportFileName);
        expect(await call('act')).toEqual(next);
      } finally {
        setMidsceneRunDir(undefined);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
