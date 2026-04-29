import { describe, expect, it } from 'vitest';
import { shouldRestartPlaybackFromBeginning } from '../src/component/player/playback-controls';
import {
  projectNativeRectToExportViewport,
  resolveExportCamera,
} from '../src/component/player/scenes/export-branded-video';
import { calculateFrameMap } from '../src/component/player/scenes/frame-calculator';
import { getPlaybackFrameState } from '../src/component/player/scenes/playback-frame';
import { getPlaybackViewport } from '../src/component/player/scenes/playback-layout';
import {
  resolveExportPointerLayout,
  resolvePointerLayout,
  resolveSpinnerLayout,
} from '../src/component/player/scenes/pointer-layout';
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

  it('projects the live pointer layout into the export viewport', () => {
    const imageWidth = 1400;
    const contentWidth = 960;
    const liveLayout = resolvePointerLayout(imageWidth);
    const exportLayout = resolveExportPointerLayout(imageWidth, contentWidth);
    const exportScale = contentWidth / imageWidth;

    expect(exportLayout.scale).toBeCloseTo(liveLayout.scale * exportScale, 5);
    expect(exportLayout.width).toBeCloseTo(liveLayout.width * exportScale, 5);
    expect(exportLayout.height).toBeCloseTo(liveLayout.height * exportScale, 5);
    expect(exportLayout.hotspotX).toBeCloseTo(
      liveLayout.hotspotX * exportScale,
      5,
    );
    expect(exportLayout.hotspotY).toBeCloseTo(
      liveLayout.hotspotY * exportScale,
      5,
    );
  });

  it('uses the same resolution scale for live and exported high-res pointers', () => {
    const imageWidth = 2560;
    const contentWidth = 960;
    const liveLayout = resolvePointerLayout(imageWidth);
    const exportLayout = resolveExportPointerLayout(imageWidth, contentWidth);

    expect(liveLayout.scale).toBeGreaterThan(1);
    expect(exportLayout.scale).toBeCloseTo(
      liveLayout.scale * (contentWidth / imageWidth),
      5,
    );
  });

  it('projects native screenshot overlays into the export viewport', () => {
    const projected = projectNativeRectToExportViewport(
      { left: 256, top: 108, width: 768, height: 28 },
      { zoom: 1, tx: 0, ty: 0 },
      {
        offsetX: 0,
        offsetY: 0,
        contentWidth: 960,
        contentHeight: 540,
        imageWidth: 1280,
        imageHeight: 720,
      },
    );

    expect(projected.left).toBeCloseTo(192, 5);
    expect(projected.top).toBeCloseTo(81, 5);
    expect(projected.width).toBeCloseTo(576, 5);
    expect(projected.height).toBeCloseTo(21, 5);
  });

  it('keeps native overlays aligned while export camera zooms', () => {
    const projected = projectNativeRectToExportViewport(
      { left: 256, top: 108, width: 768, height: 28 },
      { zoom: 2, tx: -96, ty: -54 },
      {
        offsetX: 0,
        offsetY: 0,
        contentWidth: 960,
        contentHeight: 540,
        imageWidth: 1280,
        imageHeight: 720,
      },
    );

    expect(projected.left).toBeCloseTo(192, 5);
    expect(projected.top).toBeCloseTo(54, 5);
    expect(projected.width).toBeCloseTo(1152, 5);
    expect(projected.height).toBeCloseTo(42, 5);
  });

  it('draws the loading pointer with a square box so it stays circular', () => {
    const pointerLayout = resolveExportPointerLayout(1280, 960);
    const spinnerLayout = resolveSpinnerLayout(pointerLayout);

    expect(spinnerLayout.size).toBeCloseTo(pointerLayout.height, 5);
    expect(spinnerLayout.size).toBeGreaterThan(pointerLayout.width);
    expect(spinnerLayout.centerOffset).toBeCloseTo(spinnerLayout.size / 2, 5);
  });

  it('restarts from the beginning at the effective end frame', () => {
    expect(shouldRestartPlaybackFromBeginning(120, 120)).toBe(true);
    expect(shouldRestartPlaybackFromBeginning(121, 120)).toBe(true);
    expect(shouldRestartPlaybackFromBeginning(119, 120)).toBe(false);
  });
});
