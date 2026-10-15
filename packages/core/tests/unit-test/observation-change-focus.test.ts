import { buildObservationChangeFocus } from '@/agent/observation-change-focus';
import { selectEvenlySpacedIndices } from '@/agent/observation-frame-selection';
import { ScreenshotItem } from '@/screenshot-item';
import type { Rect } from '@/types';
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

async function screenshotWithPatches(
  patches: { rect: Rect; color: string }[] = [],
  dimensions = { width: 768, height: 512 },
): Promise<ScreenshotItem> {
  const bytes = await sharp({
    create: { ...dimensions, channels: 3, background: '#ffffff' },
  })
    .composite(
      patches.map(({ rect, color }) => ({
        input: {
          create: {
            width: rect.width,
            height: rect.height,
            channels: 3,
            background: color,
          },
        },
        left: rect.left,
        top: rect.top,
      })),
    )
    .png()
    .toBuffer();
  return ScreenshotItem.create(
    `data:image/png;base64,${bytes.toString('base64')}`,
    1,
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
    expect(focus!.regions.length).toBeGreaterThanOrEqual(1);
    const { rect, measurementRect } = focus!.regions[0];
    expect(rect.left).toBeLessThanOrEqual(850);
    expect(rect.left + rect.width).toBeGreaterThanOrEqual(970);
    expect(rect.top).toBeLessThanOrEqual(600);
    expect(rect.top + rect.height).toBeGreaterThanOrEqual(660);
    expect(measurementRect.left).toBeGreaterThanOrEqual(rect.left);
    expect(measurementRect.top).toBeGreaterThanOrEqual(rect.top);
    expect(measurementRect.left + measurementRect.width).toBeLessThanOrEqual(
      rect.left + rect.width,
    );
    expect(measurementRect.top + measurementRect.height).toBeLessThanOrEqual(
      rect.top + rect.height,
    );
    expect(
      focus!.frames.map(({ screenshot }) => screenshot.capturedAt),
    ).toEqual([100, 200, 300]);
    expect(
      focus!.frames.map(({ sourceFrameIndex }) => sourceFrameIndex),
    ).toEqual([0, 1, 2]);
    const metadata = await sharp(
      Buffer.from(focus!.frames[0].screenshot.rawBase64, 'base64'),
    ).metadata();
    expect(metadata.width).toBe(960);

    const rendered = await sharp(
      Buffer.from(focus!.frames[0].screenshot.rawBase64, 'base64'),
    )
      .removeAlpha()
      .raw()
      .toBuffer();
    let orangePixelCount = 0;
    for (let offset = 0; offset < rendered.length; offset += 3) {
      if (
        rendered[offset] > 200 &&
        rendered[offset + 1] > 50 &&
        rendered[offset + 1] < 180 &&
        rendered[offset + 2] < 80
      ) {
        orangePixelCount += 1;
      }
    }
    expect(orangePixelCount).toBeGreaterThan(100);
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
    expect(
      focus!.regions.some(({ rect }) => rect.left < 180 && rect.top < 140),
    ).toBe(true);
    expect(
      focus!.regions.some(
        ({ rect }) =>
          rect.left + rect.width > 1000 && rect.top + rect.height > 650,
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
    expect(focus!.frames[0].sourceFrameIndex).toBe(0);
    expect(focus!.frames.at(-1)?.sourceFrameIndex).toBe(11);
  });

  it('detects a transient change in every source frame before limiting evidence', async () => {
    const background = { r: 240, g: 240, b: 240 };
    const baseline = await screenshot(background, false, 100);
    const transient = await screenshot(background, true, 125);
    const frames = Array.from({ length: 51 }, () => baseline);
    // A 50-frame evenly spaced pre-sample omits source frame 25.
    frames[25] = transient;

    const focus = await buildObservationChangeFocus(frames);

    expect(focus).toBeDefined();
    expect(
      focus!.frames.some(({ sourceFrameIndex }) => sourceFrameIndex === 25),
    ).toBe(true);
  });

  it('does not create focus frames for an unchanged sequence', async () => {
    const background = { r: 240, g: 240, b: 240 };
    const frames = [
      await screenshot(background, false, 100),
      await screenshot(background, false, 200),
    ];

    await expect(buildObservationChangeFocus(frames)).resolves.toBeUndefined();
  });

  it('preserves a release between repeated pressed states', async () => {
    const baseline = await screenshot({ r: 240, g: 240, b: 240 });
    const pressed = await screenshot({ r: 240, g: 240, b: 240 }, true);
    const focus = await buildObservationChangeFocus([
      baseline,
      pressed,
      pressed,
      pressed,
      pressed,
      pressed,
      baseline,
      pressed,
    ]);
    expect(
      focus!.frames.map(({ sourceFrameIndex }) => sourceFrameIndex),
    ).toContain(6);
    expect(focus!.frames).toHaveLength(6);
  });

  it('preserves color changes with nearly identical luminance', async () => {
    const baseline = await screenshot({ r: 255, g: 0, b: 0 });
    const changed = await screenshot({ r: 0, g: 76, b: 0 });
    const focus = await buildObservationChangeFocus([
      baseline,
      baseline,
      baseline,
      baseline,
      baseline,
      baseline,
      changed,
      baseline,
    ]);
    expect(
      focus!.frames.map(({ sourceFrameIndex }) => sourceFrameIndex),
    ).toContain(6);
  });

  it('ignores unrelated changes outside the requested observation region', async () => {
    const baseline = await screenshot({ r: 240, g: 240, b: 240 });
    const changed = await screenshot({ r: 240, g: 240, b: 240 }, true);
    await expect(
      buildObservationChangeFocus([baseline, changed], undefined, {
        left: 0,
        top: 0,
        width: 200,
        height: 200,
      }),
    ).resolves.toBeUndefined();
    const focus = await buildObservationChangeFocus(
      [baseline, changed],
      undefined,
      { left: 800, top: 550, width: 250, height: 200 },
    );
    expect(focus).toBeDefined();
    await expect(
      buildObservationChangeFocus([baseline, changed], undefined, {
        left: -1,
        top: 0,
        width: 100,
        height: 100,
      }),
    ).rejects.toThrow('observationRegion');
  });

  it('excludes changes touching every ROI edge, including within the same tile', async () => {
    const baseline = await screenshotWithPatches();
    const roi = { left: 100, top: 100, width: 8, height: 8 };
    const outsidePatches = [
      { left: 108, top: 96, width: 4, height: 16 },
      { left: 96, top: 96, width: 4, height: 16 },
      { left: 100, top: 96, width: 8, height: 4 },
      { left: 100, top: 108, width: 8, height: 4 },
    ];
    for (const rect of outsidePatches) {
      const changed = await screenshotWithPatches([{ rect, color: '#000000' }]);
      await expect(
        buildObservationChangeFocus([baseline, changed], undefined, roi),
      ).resolves.toBeUndefined();
    }
  });

  it('crops the ROI before downsampling so outside pixels cannot bleed into detection', async () => {
    const dimensions = { width: 2000, height: 512 };
    const roi = { left: 100, top: 100, width: 1000, height: 128 };
    const baseline = await screenshotWithPatches([], dimensions);
    const changed = await screenshotWithPatches(
      [
        {
          rect: { left: 1100, top: 100, width: 32, height: 128 },
          color: '#000000',
        },
      ],
      dimensions,
    );
    await expect(
      buildObservationChangeFocus([baseline, changed], undefined, roi),
    ).resolves.toBeUndefined();
  });

  it('keeps target transition evidence and measured coordinates inside a small offset ROI', async () => {
    const roi = { left: 100, top: 100, width: 8, height: 8 };
    const baseline = await screenshotWithPatches();
    const outside = await screenshotWithPatches([
      { rect: { left: 108, top: 96, width: 16, height: 16 }, color: '#000000' },
    ]);
    const pressed = await screenshotWithPatches([
      { rect: roi, color: '#000000' },
    ]);
    const focus = await buildObservationChangeFocus(
      [
        baseline,
        outside,
        baseline,
        outside,
        baseline,
        outside,
        pressed,
        baseline,
      ],
      undefined,
      roi,
    );
    expect(
      focus!.frames.map(({ sourceFrameIndex }) => sourceFrameIndex),
    ).toContain(6);
    expect(focus!.regions).toHaveLength(1);
    expect(focus!.regions[0].measurementRect).toEqual(roi);
    const { rect } = focus!.regions[0];
    // Verify the enlarged evidence actually contains the dark pressed pixels,
    // not just a selected frame index or an orange annotation.
    const pixel = await sharp(
      Buffer.from(
        focus!.frames.find(({ sourceFrameIndex }) => sourceFrameIndex === 6)!
          .screenshot.rawBase64,
        'base64',
      ),
    )
      .extract({
        left: Math.round(((104 - rect.left) * 960) / rect.width),
        top: 64 + Math.round(((104 - rect.top) * 960) / rect.width),
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect(Math.max(...pixel)).toBeLessThan(30);
  });

  it('keeps fractional ROI bounds inside the requested area and rejects subpixel-only regions', async () => {
    const baseline = await screenshotWithPatches();
    const changed = await screenshotWithPatches([
      { rect: { left: 101, top: 101, width: 7, height: 7 }, color: '#000000' },
    ]);
    const focus = await buildObservationChangeFocus(
      [baseline, changed],
      undefined,
      { left: 100.5, top: 100.5, width: 8, height: 8 },
    );
    expect(focus!.regions[0].measurementRect).toEqual({
      left: 101,
      top: 101,
      width: 7,
      height: 7,
    });
    await expect(
      buildObservationChangeFocus([baseline, changed], undefined, {
        left: 100.1,
        top: 100.1,
        width: 0.2,
        height: 0.2,
      }),
    ).rejects.toThrow('whole screenshot pixel');
  });

  it('rejects different original resolutions even when resized dimensions match', async () => {
    const baseline = await screenshotWithPatches([], {
      width: 1200,
      height: 800,
    });
    const changed = await screenshotWithPatches([], {
      width: 2400,
      height: 1600,
    });
    await expect(
      buildObservationChangeFocus([baseline, changed]),
    ).rejects.toThrow('matching original dimensions');
    await expect(
      buildObservationChangeFocus([baseline, changed], undefined, {
        left: 100,
        top: 100,
        width: 200,
        height: 200,
      }),
    ).rejects.toThrow('matching original dimensions');
  });

  it('honors cancellation before image analysis starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const frames = [
      await screenshot({ r: 240, g: 240, b: 240 }),
      await screenshot({ r: 240, g: 240, b: 240 }, true),
    ];

    await expect(
      buildObservationChangeFocus(frames, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('selects a bounded sample with both source endpoints', () => {
    const indices = selectEvenlySpacedIndices(101, 50);

    expect(indices).toHaveLength(50);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(100);
    expect(new Set(indices).size).toBe(50);
    expect(selectEvenlySpacedIndices(5, 1)).toEqual([0]);
    expect(selectEvenlySpacedIndices(0, 5)).toEqual([]);
  });
});
