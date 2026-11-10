import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PlaywrightAgent } from '@/playwright';
import { expect, test } from '@playwright/test';

const locatePrompt = 'the card that exactly matches the target pattern';

// Each fixture has the same four colors in a distinct 2×2 arrangement.
// Test distinct targets on both rows with a fresh page/agent.
for (const targetSlot of [0, 2, 4]) {
  test(`aiAct passes reference texture ${targetSlot} to independent locating`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const fixtureDir = path.join(
      __dirname,
      '__fixtures__/image-prompt-texture',
    );
    const referencePath = path.join(fixtureDir, `texture-${targetSlot}.png`);
    const referenceUrl = `data:image/png;base64,${readFileSync(referencePath).toString('base64')}`;
    const requestsWithReference: boolean[] = [];
    const agent = new PlaywrightAgent(page, {
      cache: false,
      replanningCycleLimit: 3,
      reportFileName: `image-prompt-texture-${testInfo.testId}`,
      createOpenAIClient: async (client) => {
        const create = client.chat.completions.create;
        client.chat.completions.create = new Proxy(create, {
          apply(target, thisArg, args) {
            // Inspect the actual outbound payload without replacing model calls.
            const request = args[0];
            requestsWithReference.push(
              request.messages.some(
                (message: { content: unknown }) =>
                  Array.isArray(message.content) &&
                  message.content.some(
                    (part: { type: string; image_url?: { url: string } }) =>
                      part.type === 'image_url' &&
                      part.image_url?.url === referenceUrl,
                  ),
              ),
            );
            return Reflect.apply(target, thisArg, args);
          },
        });
        return client;
      },
    });

    try {
      await page.setViewportSize({ width: 1000, height: 800 });
      await page.goto(pathToFileURL(path.join(fixtureDir, 'index.html')).href);
      await testInfo.attach('target pattern', {
        path: referencePath,
        contentType: 'image/png',
      });
      await testInfo.attach('candidate cards', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });

      await agent.aiAct(
        {
          prompt: `Click the card that exactly matches the reference image named "target pattern". Click only once.
When planning the click action, locate.prompt must be exactly "${locatePrompt}". Do not add or change any words, and do not include rows, columns, positions, indices, coordinates, or descriptions of the pattern's appearance.
Leave image matching to the independent locating step.`,
          images: [{ name: 'target pattern', url: referenceUrl }],
        },
        { effort: 'deepThink' },
      );

      await expect
        .poll(() => page.evaluate(() => (window as any).clickedSlots))
        .toEqual([targetSlot]);
      // deepThink requires separate planning and grounding calls. Every call
      // must retain the reference, and locating must use only the image-matching prompt.
      const locateTasks = agent.dump.executions.flatMap((execution) =>
        execution.tasks.filter(
          (task) => task.type === 'Planning' && task.subType === 'Locate',
        ),
      );
      expect(locateTasks.length).toBeGreaterThan(0);
      for (const task of locateTasks) {
        expect(task.timing?.callAiStart).toBeDefined();
        expect(task.param).toEqual(
          expect.objectContaining({
            prompt: expect.objectContaining({ prompt: locatePrompt }),
          }),
        );
      }
      expect(requestsWithReference.length).toBeGreaterThanOrEqual(2);
      expect(requestsWithReference.every(Boolean)).toBe(true);
    } finally {
      await agent.destroy();
    }
  });
}
