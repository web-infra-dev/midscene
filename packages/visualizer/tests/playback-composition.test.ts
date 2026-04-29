import { describe, expect, it } from 'vitest';
import {
  resolveExportCamera,
  resolveExportPointerLayout,
} from '../src/component/player/scenes/export-branded-video';
import { calculateFrameMap } from '../src/component/player/scenes/frame-calculator';
import { getPlaybackFrameState } from '../src/component/player/scenes/playback-frame';
import { getPlaybackViewport } from '../src/component/player/scenes/playback-layout';
import type { AnimationScript } from '../src/utils/replay-scripts';

describe('playback composition sizing', () => {
  it('uses the current frame dimensions when playback changes orientation', () => {
    const scripts: AnimationScript[] = [
      {
        type: 'img',
        img: 'portrait-frame',
        duration: 500,
        imageWidth: 720,
        imageHeight: 1280,
      },
      {
        type: 'img',
        img: 'landscape-frame',
        duration: 500,
        imageWidth: 1280,
        imageHeight: 720,
      },
    ];

    const frameMap = calculateFrameMap(scripts);
    const portraitFrame = getPlaybackFrameState(frameMap, 0);
    const landscapeFrame = getPlaybackFrameState(frameMap, 20);

    expect(frameMap.imageWidth).toBe(720);
    expect(frameMap.imageHeight).toBe(1280);
    expect(portraitFrame?.imageWidth).toBe(720);
    expect(portraitFrame?.imageHeight).toBe(1280);
    expect(landscapeFrame?.imageWidth).toBe(1280);
    expect(landscapeFrame?.imageHeight).toBe(720);
    expect(portraitFrame?.camera.width).toBe(720);
    expect(landscapeFrame?.camera.width).toBe(1280);
  });

  it('falls back to the provided image size when scripts omit dimensions', () => {
    const scripts: AnimationScript[] = [
      {
        type: 'img',
        img: 'frame-without-dimensions',
        duration: 500,
      },
    ];

    const frameMap = calculateFrameMap(scripts, {
      imageWidth: 1600,
      imageHeight: 900,
    });
    const frameState = getPlaybackFrameState(frameMap, 0);

    expect(frameMap.imageWidth).toBe(1600);
    expect(frameMap.imageHeight).toBe(900);
    expect(frameState?.imageWidth).toBe(1600);
    expect(frameState?.imageHeight).toBe(900);
  });

  it('letterboxes exported portrait frames instead of stretching them', () => {
    const viewport = getPlaybackViewport(960, 540, 720, 1280);

    expect(viewport.contentHeight).toBe(540);
    expect(viewport.contentWidth).toBeCloseTo(303.75, 5);
    expect(viewport.offsetX).toBeCloseTo(328.125, 5);
    expect(viewport.offsetY).toBe(0);
  });

  it('disables camera zoom for export when focus on cursor is off', () => {
    const prevCamera = { left: 120, top: 80, width: 640 };
    const camera = { left: 320, top: 200, width: 360 };
    const progress = 0.5;

    expect(
      resolveExportCamera(prevCamera, camera, 1280, progress, false),
    ).toEqual({
      camLeft: 0,
      camTop: 0,
      camWidth: 1280,
    });

    expect(
      resolveExportCamera(prevCamera, camera, 1280, progress, true),
    ).toEqual({
      camLeft: 220,
      camTop: 140,
      camWidth: 500,
    });
  });

  it('scales exported pointer to match live playback at the export viewport size', () => {
    expect(resolveExportPointerLayout(1280, 960)).toEqual({
      width: 33,
      height: 42,
      hotspotX: 4.5,
      hotspotY: 3,
      centerOffsetX: 16.5,
      centerOffsetY: 21,
    });

    expect(resolveExportPointerLayout(1920, 960)).toEqual({
      width: 22,
      height: 28,
      hotspotX: 3,
      hotspotY: 2,
      centerOffsetX: 11,
      centerOffsetY: 14,
    });
  });
});
