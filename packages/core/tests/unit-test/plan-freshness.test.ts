import { checkPlanFreshness } from '@/agent/plan-freshness';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { imageDifference } from '@midscene/shared/img';
import { describe, expect, it } from '@rstest/core';
import sharp from 'sharp';

async function screenshot(
  rect?: { left: number; top: number; width: number; height: number },
  color = 0,
  width = 200,
  height = 120,
) {
  const image = sharp({
    create: { width, height, channels: 3, background: 'white' },
  });
  if (rect)
    image.composite([
      {
        input: await sharp({
          create: {
            width: rect.width,
            height: rect.height,
            channels: 3,
            background: { r: color, g: color, b: color },
          },
        })
          .png()
          .toBuffer(),
        left: rect.left,
        top: rect.top,
      },
    ]);
  return ScreenshotItem.create(
    `data:image/png;base64,${(await image.png().toBuffer()).toString('base64')}`,
    Date.now(),
  );
}
const tap = {
  type: 'Tap',
  param: {
    locate: {
      locatedPixelResult: {
        center: [60, 50],
        rect: { left: 40, top: 40, width: 40, height: 20 },
      },
    },
  },
};
const context = (shot: ScreenshotItem, ratio = 1) =>
  ({
    screenshot: shot,
    shotSize: { width: 200, height: 120 },
    shrunkShotToLogicalRatio: ratio,
  }) as UIContext;

describe('planning screen freshness', () => {
  it('detects changes anywhere on screen, including far from the tap', async () => {
    const result = await checkPlanFreshness(
      [tap],
      context(await screenshot()),
      await screenshot({ left: 140, top: 10, width: 30, height: 30 }),
    );
    expect(result).toEqual({
      changed: true,
      changedPixels: 900,
      dimensionsChanged: false,
    });
  });
  it('does not dilute a small arrow change on a large screen', async () => {
    const before = await screenshot(undefined, 0, 1920, 1080);
    const after = await screenshot(
      { left: 1800, top: 900, width: 4, height: 6 },
      0,
      1920,
      1080,
    );
    expect(
      (await checkPlanFreshness([tap], context(before), after))?.changed,
    ).toBe(true);
  });
  it('ignores fewer than 16 changed pixels and minor color noise', async () => {
    const before = context(await screenshot());
    expect(
      (
        await checkPlanFreshness(
          [tap],
          before,
          await screenshot({ left: 60, top: 50, width: 3, height: 5 }),
        )
      )?.changed,
    ).toBe(false);
    expect(
      (
        await checkPlanFreshness(
          [tap],
          before,
          await screenshot({ left: 60, top: 50, width: 4, height: 4 }),
        )
      )?.changed,
    ).toBe(true);
    expect(
      (
        await checkPlanFreshness(
          [tap],
          before,
          await screenshot({ left: 40, top: 40, width: 40, height: 20 }, 240),
        )
      )?.changed,
    ).toBe(false);
  });
  it('detects screenshot dimension changes', async () => {
    expect(
      (
        await checkPlanFreshness(
          [tap],
          context(await screenshot()),
          await screenshot(undefined, 0, 201, 120),
        )
      )?.dimensionsChanged,
    ).toBe(true);
  });
  it('does not depend on target boxes or device pixel ratio', async () => {
    const result = await checkPlanFreshness(
      [{ type: 'Tap', param: { locate: { prompt: 'button' } } }],
      context(await screenshot(), 2),
      await screenshot({ left: 140, top: 10, width: 8, height: 8 }),
    );
    expect(result?.changed).toBe(true);
  });
  it('does not compare later taps after earlier actions have run', async () => {
    expect(
      await checkPlanFreshness(
        [{ type: 'Scroll', param: {} }, tap],
        context(await screenshot()),
        await screenshot(),
      ),
    ).toBeUndefined();
  });
  it('does not trigger when the screen is unchanged', async () => {
    const before = await screenshot();
    expect(await imageDifference(before.base64, before.base64)).toEqual({
      changedPixels: 0,
      dimensionsChanged: false,
    });
    expect(
      (await checkPlanFreshness([tap], context(before), await screenshot()))
        ?.changed,
    ).toBe(false);
  });
});
