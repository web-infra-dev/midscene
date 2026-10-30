import { checkPlanFreshness } from '@/agent/plan-freshness';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { imageRegionDifference } from '@midscene/shared/img';
import { describe, expect, it } from '@rstest/core';
import sharp from 'sharp';

async function screenshot(
  rect?: { left: number; top: number; width: number; height: number },
  color = 0,
) {
  const image = sharp({
    create: { width: 200, height: 120, channels: 3, background: 'white' },
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

describe('planning target freshness', () => {
  it('rejects changed target pixels, including a small expand arrow', async () => {
    const result = await checkPlanFreshness(
      [tap],
      context(await screenshot()),
      await screenshot({ left: 72, top: 46, width: 6, height: 6 }),
    );
    expect(result?.changed).toBe(true);
  });
  it('includes a disclosure arrow beside a tight text-only target box', async () => {
    const result = await checkPlanFreshness(
      [
        {
          type: 'Tap',
          param: {
            locate: {
              locatedPixelResult: {
                center: [59, 50],
                rect: { left: 43, top: 40, width: 34, height: 19 },
              },
            },
          },
        },
      ],
      context(await screenshot()),
      await screenshot({ left: 98, top: 46, width: 4, height: 6 }),
    );
    expect(result?.changed).toBe(true);
  });
  it('ignores changes outside the target region', async () => {
    const result = await checkPlanFreshness(
      [tap],
      context(await screenshot()),
      await screenshot({ left: 140, top: 10, width: 30, height: 30 }),
    );
    expect(result?.changed).toBe(false);
  });
  it('ignores isolated noise and small color differences', async () => {
    const before = context(await screenshot());
    expect(
      (
        await checkPlanFreshness(
          [tap],
          before,
          await screenshot({ left: 60, top: 50, width: 1, height: 1 }),
        )
      )?.changed,
    ).toBe(false);
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
  it('keeps planning coordinates in screenshot pixels on high DPI devices', async () => {
    expect(
      (
        await checkPlanFreshness(
          [tap],
          context(await screenshot(), 2),
          await screenshot({ left: 60, top: 45, width: 8, height: 8 }),
        )
      )?.changed,
    ).toBe(true);
  });
  it('does not compare later targets against a pre-action screenshot', async () => {
    const result = await checkPlanFreshness(
      [{ type: 'Scroll', param: {} }, tap],
      context(await screenshot()),
      await screenshot({ left: 40, top: 40, width: 40, height: 20 }),
    );
    expect(result).toBeUndefined();
  });
  it('leaves prompt-only taps for the locate step', async () => {
    expect(
      await checkPlanFreshness(
        [{ type: 'Tap', param: { locate: { prompt: 'button' } } }],
        context(await screenshot()),
        await screenshot(),
      ),
    ).toBeUndefined();
  });
  it('rejects invalid comparison regions rather than silently accepting them', async () => {
    const shot = await screenshot();
    await expect(
      imageRegionDifference(shot.base64, shot.base64, {
        left: Number.NaN,
        top: 0,
        width: 10,
        height: 10,
      }),
    ).rejects.toThrow('finite, positive');
  });
});
