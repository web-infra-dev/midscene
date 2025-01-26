import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { describe, expect, it, test, vi } from 'vitest';
import { launchPage } from './utils';

test(
  'scroll down',
  async () => {
    const { originPage, reset } = await launchPage('https://www.bing.com/');
    const onTaskStartTip = vi.fn();
    const mid = new PuppeteerAgent(originPage, {
      cacheId: 'puppeteer(scroll down)',
      onTaskStartTip,
    });

    await mid.ai('search "Midscene" and scroll down');

    await reset();
  },
  {
    timeout: 3 * 60 * 10,
  },
);
