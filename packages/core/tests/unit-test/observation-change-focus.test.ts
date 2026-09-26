import { buildObservationChangeFocus } from '@/agent/observation-change-focus';
import { ScreenshotItem } from '@/screenshot-item';
import { describe, expect, it } from '@rstest/core';
import sharp from 'sharp';

async function screenshot(
  color: { r: number; g: number; b: number },
  changed = false,
  capturedAt = 1,
): Promise<ScreenshotItem> {
  let image = sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: color,
    },
  });
  if (changed) {
    image = image.composite([
      {
        input: {
          create: {
            width: 120,
            height: 60,
            channels: 3,
            background: { r: 120, g: 120, b: 120 },
          },
        },
        left: 850,
        top: 600,
      },
    ]);
  }
  const bytes = await image.jpeg().toBuffer();
  return ScreenshotItem.create(
    `data:image/jpeg;base64,${bytes.toString('base64')}`,
    capturedAt,
  );
}

describe('buildObservationChangeFocus', () => {
  it('crops and enlarges the strongest localized change across frames', async () => {
    const background = { r: 240, g: 240, b: 240 };
    const frames = [
      await screenshot(background, false, 100),
      await screenshot(background, true, 200),
      await screenshot(background, false, 300),
    ];

    const focus = await buildObservationChangeFocus(frames);

    expect(focus).toBeDefined();
    expect(focus!.score).toBeGreaterThan(4);
    expect(focus!.rects.length).toBeGreaterThanOrEqual(1);
    expect(focus!.changes[0][0]).toEqual({
      meanAbsoluteDifference: 0,
      brightnessDelta: 0,
    });
    expect(focus!.changes[0][1].brightnessDelta).toBeLessThan(0);
    expect(focus!.rect.left).toBeLessThanOrEqual(850);
    expect(focus!.rect.left + focus!.rect.width).toBeGreaterThanOrEqual(970);
    expect(focus!.rect.top).toBeLessThanOrEqual(600);
    expect(focus!.rect.top + focus!.rect.height).toBeGreaterThanOrEqual(660);
    expect(focus!.frames.map((frame) => frame.capturedAt)).toEqual([
      100, 200, 300,
    ]);
    expect(focus!.frameIndices).toEqual([0, 1, 2]);
    expect(focus!.measurementRects).toHaveLength(focus!.rects.length);
    const metadata = await sharp(
      Buffer.from(focus!.frames[0].rawBase64, 'base64'),
    ).metadata();
    expect(metadata.width).toBe(960);
  });

  it('finds independent changes in distant parts of the screen', async () => {
    const base = sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    });
    const before = await base.clone().jpeg().toBuffer();
    const after = await base
      .clone()
      .composite([
        {
          input: {
            create: {
              width: 100,
              height: 60,
              channels: 3,
              background: { r: 20, g: 20, b: 20 },
            },
          },
          left: 80,
          top: 80,
        },
        {
          input: {
            create: {
              width: 100,
              height: 60,
              channels: 3,
              background: { r: 20, g: 20, b: 20 },
            },
          },
          left: 1000,
          top: 650,
        },
      ])
      .jpeg()
      .toBuffer();
    const focus = await buildObservationChangeFocus([
      ScreenshotItem.create(
        `data:image/jpeg;base64,${before.toString('base64')}`,
        1,
      ),
      ScreenshotItem.create(
        `data:image/jpeg;base64,${after.toString('base64')}`,
        2,
      ),
    ]);

    expect(focus).toBeDefined();
    expect(focus!.rects.some((rect) => rect.left < 180 && rect.top < 140)).toBe(
      true,
    );
    expect(
      focus!.rects.some(
        (rect) => rect.left + rect.width > 1000 && rect.top + rect.height > 650,
      ),
    ).toBe(true);
  });

  it('caps rendered evidence while preserving baseline and final frames', async () => {
    const background = { r: 240, g: 240, b: 240 };
    const frames = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        screenshot(background, index > 0 && index < 11, 100 + index),
      ),
    );

    const focus = await buildObservationChangeFocus(frames);

    expect(focus!.frames.length).toBeLessThanOrEqual(6);
    expect(focus!.frameIndices[0]).toBe(0);
    expect(focus!.frameIndices.at(-1)).toBe(11);
  });

  it('does not create focus frames for an unchanged sequence', async () => {
    const background = { r: 240, g: 240, b: 240 };
    const frames = [
      await screenshot(background, false, 100),
      await screenshot(background, false, 200),
    ];

    await expect(buildObservationChangeFocus(frames)).resolves.toBeUndefined();
  });
});
