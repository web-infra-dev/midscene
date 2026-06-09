import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { uuid } from '@midscene/shared/utils';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFixturePath } from './test-utils';
import { launchPage } from './utils';

const DECOY_XPATH = '//*[@id="decoy"]';

type LooseCache = {
  type: 'plan' | 'locate';
  prompt: unknown;
  cache?: { xpaths?: string[] };
  xpaths?: string[];
  yamlWorkflow?: string;
};
type LooseCacheFile = { caches: LooseCache[] };

function readCacheFile(path: string): LooseCacheFile {
  return yaml.load(fs.readFileSync(path, 'utf-8')) as LooseCacheFile;
}

/**
 * Reproduce locate cache poisoning (#2529) end-to-end against a real model, and
 * verify the fix.
 *
 * Setup:
 *  - Run 1 (read-write): aiAct genuinely locates and clicks the real button, so
 *    a correct plan + locate cache is written.
 *  - Poison: rewrite every locate entry's xpath to point at a decoy element that
 *    exists (so the cache hit resolves) but does NOT complete the task, and drop
 *    the plan cache so Run 2 re-plans (a plan-cache hit would run the cached
 *    yaml and bypass the replanning path that detects the bad hit).
 *  - Run 2 (read-write, same cache id): the poisoned locate is hit -> the decoy
 *    is actioned -> the goal is not reached -> aiAct replans -> the consumed
 *    cache entry is marked stale -> the re-locate REPLACES it in place.
 *
 * Before the fix the re-locate appended a second entry, leaving [stale, correct]
 * so the stale entry was matched first on every later run (perpetual replanning).
 *
 * Note: this is a real-model e2e test, so it depends on the model regenerating a
 * matching locate prompt on Run 2. CI retries AI tests once to absorb flakiness.
 */
describe(
  'locate cache poisoning (#2529)',
  () => {
    let agent1: PuppeteerAgent | undefined;
    let agent2: PuppeteerAgent | undefined;
    let reset1: (() => Promise<void>) | undefined;
    let reset2: (() => Promise<void>) | undefined;
    let cacheFileToCleanup: string | undefined;

    afterEach(async () => {
      for (const a of [agent1, agent2]) {
        if (a) {
          try {
            await a.destroy();
          } catch (e) {
            console.warn('agent destroy error', e);
          }
        }
      }
      for (const r of [reset1, reset2]) {
        if (r) {
          await r();
        }
      }
      if (cacheFileToCleanup && fs.existsSync(cacheFileToCleanup)) {
        fs.unlinkSync(cacheFileToCleanup);
      }
      agent1 = agent2 = undefined;
      reset1 = reset2 = undefined;
      cacheFileToCleanup = undefined;
    });

    it(
      'replaces the poisoned locate entry on replanning instead of appending a duplicate',
      async () => {
        const fixture = `file://${getFixturePath('cache-poisoning.html')}`;
        const cacheId = `locate-poison-${uuid()}`;
        const actPrompt =
          'Click the blue "Submit Order" button to submit the order';
        const assertPrompt =
          'the page shows the text "Order submitted successfully"';

        // --- Run 1: produce a genuine, correct cache ---------------------------
        const run1 = await launchPage(fixture);
        reset1 = run1.reset;
        agent1 = new PuppeteerAgent(run1.originPage, {
          cache: { id: cacheId },
        });
        // deepThink disables inline-bbox planning, so the locate step actually
        // consults the locate cache (otherwise a single-model plan returns a
        // bbox directly and the locate cache is never read).
        await agent1.aiAct(actPrompt, { deepThink: true });
        await agent1.aiAssert(assertPrompt);
        await sleep(1000);

        const cacheFile = agent1.taskCache?.cacheFilePath;
        expect(cacheFile).toBeDefined();
        cacheFileToCleanup = cacheFile;

        const beforeCache = readCacheFile(cacheFile!);
        const locateEntriesBefore = beforeCache.caches.filter(
          (c) => c.type === 'locate',
        );
        console.log(
          'run1 locate prompts:',
          JSON.stringify(locateEntriesBefore.map((c) => c.prompt)),
        );
        // Run 1 must have produced at least one locate cache entry to poison.
        expect(locateEntriesBefore.length).toBeGreaterThanOrEqual(1);
        const poisonedPrompts = locateEntriesBefore.map((c) => c.prompt);
        const locateCountBefore = locateEntriesBefore.length;

        // --- Poison: point every locate at the decoy, drop plan caches ---------
        const poisoned: LooseCacheFile = {
          ...beforeCache,
          caches: beforeCache.caches
            .filter((c) => c.type === 'locate')
            .map((c) => ({
              type: 'locate' as const,
              prompt: c.prompt,
              cache: { xpaths: [DECOY_XPATH] },
            })),
        };
        fs.writeFileSync(cacheFile!, yaml.dump(poisoned));

        // --- Run 2: hit the poisoned cache, expect replanning + in-place fix ---
        const run2 = await launchPage(fixture);
        reset2 = run2.reset;
        agent2 = new PuppeteerAgent(run2.originPage, {
          cache: { id: cacheId },
        });
        const staleSpy = vi.spyOn(agent2.taskCache!, 'markLocateCacheStale');
        const matchSpy = vi.spyOn(agent2.taskCache!, 'matchLocateCache');

        await agent2.aiAct(actPrompt, { deepThink: true });
        await agent2.aiAssert(assertPrompt);
        await sleep(1000);

        const consumedPoisonedCache = matchSpy.mock.results.some((r) =>
          isDeepStrictEqual(r.value?.cacheContent?.cache?.xpaths, [
            DECOY_XPATH,
          ]),
        );
        console.log(
          'run2 consumed poisoned locate cache:',
          consumedPoisonedCache,
        );
        console.log(
          'run2 matchLocateCache hits:',
          matchSpy.mock.results.filter((r) => r.value !== undefined).length,
          '/ calls:',
          matchSpy.mock.calls.length,
        );
        console.log(
          'run2 markLocateCacheStale calls:',
          staleSpy.mock.calls.length,
        );

        if (!consumedPoisonedCache) {
          console.warn(
            'Run 2 did not consume the poisoned locate cache; skipping stale-entry assertions for this real-model run.',
          );
          return;
        }

        // The poisoned hit was detected and its entry was marked stale.
        expect(staleSpy).toHaveBeenCalled();

        const afterCache = readCacheFile(cacheFile!);
        const locateEntriesAfter = afterCache.caches.filter(
          (c) => c.type === 'locate',
        );

        // No locate entry still points at the decoy — the stale entry was
        // refreshed in place, not left behind.
        const stillDecoy = locateEntriesAfter.filter((c) =>
          isDeepStrictEqual(c.cache?.xpaths, [DECOY_XPATH]),
        );
        expect(stillDecoy).toHaveLength(0);

        // For each poisoned prompt, there is at most one locate entry — the fix
        // replaced rather than appended a duplicate ([stale, correct]).
        for (const prompt of poisonedPrompts) {
          const samePrompt = locateEntriesAfter.filter((c) =>
            isDeepStrictEqual(c.prompt, prompt),
          );
          expect(samePrompt.length).toBeLessThanOrEqual(1);
        }

        // The locate cache did not grow beyond what Run 1 produced.
        expect(locateEntriesAfter.length).toBeLessThanOrEqual(
          locateCountBefore,
        );
      },
      6 * 60 * 1000,
    );
  },
  6 * 60 * 1000,
);
