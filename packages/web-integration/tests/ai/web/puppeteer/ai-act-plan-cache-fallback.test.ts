import fs from 'node:fs';
import { PuppeteerAgent } from '@/puppeteer';
import { TaskCache } from '@midscene/core/agent';
import { uuid } from '@midscene/shared/utils';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFixturePath } from './test-utils';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 3 * 60 * 1000,
});

describe('aiAct plan cache fallback', () => {
  let agent: PuppeteerAgent | undefined;
  let resetFn: (() => Promise<void>) | undefined;
  let cacheFilePathToCleanup: string | undefined;

  afterEach(async () => {
    if (agent) {
      await agent.destroy();
      agent = undefined;
    }

    if (resetFn) {
      await resetFn();
      resetFn = undefined;
    }

    if (cacheFilePathToCleanup && fs.existsSync(cacheFilePathToCleanup)) {
      fs.unlinkSync(cacheFilePathToCleanup);
      cacheFilePathToCleanup = undefined;
    }
  });

  it('should fall back when a cached optional popup plan no longer matches the page', async () => {
    const prompt = 'click the Complete purchase button';
    const staleWorkflow = `tasks:
  - name: click the Complete purchase button
    flow:
      - aiTap: the close button in the optional promotion popup
      - aiTap: the Complete purchase button
`;
    const cacheId = `optional-popup-plan-cache-${uuid()}`;
    const staleCache = new TaskCache(cacheId, true);
    cacheFilePathToCleanup = staleCache.cacheFilePath;
    staleCache.appendCache({
      type: 'plan',
      prompt,
      yamlWorkflow: staleWorkflow,
    });

    const { originPage, reset } = await launchPage(
      `file://${getFixturePath('optional-popup-cache.html')}`,
    );
    resetFn = reset;

    agent = new PuppeteerAgent(originPage, {
      cache: { id: cacheId },
    });
    const runYamlSpy = vi.spyOn(agent, 'runYaml');
    const actionSpy = vi.spyOn((agent as any).taskExecutor, 'action');

    await agent.aiAct(prompt);

    expect(runYamlSpy).toHaveBeenCalledOnce();
    expect(actionSpy).toHaveBeenCalled();
    await expect(
      originPage.$eval('#status', (element) => element.textContent),
    ).resolves.toBe('Order completed');

    const cacheContent = yaml.load(
      fs.readFileSync(cacheFilePathToCleanup!, 'utf-8'),
    ) as {
      caches: Array<{
        type: string;
        prompt: string;
        yamlWorkflow?: string;
      }>;
    };
    const planCaches = cacheContent.caches.filter(
      (cache) => cache.type === 'plan' && cache.prompt === prompt,
    );
    expect(planCaches).toHaveLength(1);
    expect(planCaches[0].yamlWorkflow).not.toBe(staleWorkflow);
    expect(planCaches[0].yamlWorkflow).toContain('flow: []');
  });
});
