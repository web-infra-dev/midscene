import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AndroidDevice } from '@/index';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

const RUN_REMOTE_SCRCPY_E2E =
  process.env.AI_TEST_TYPE === 'android' &&
  process.env.MIDSCENE_ANDROID_REMOTE_SCRCPY_E2E === '1';
const REMOTE_SERIAL = process.env.MIDSCENE_ANDROID_REMOTE_SERIAL;
const VIDEO_BIT_RATE = Number(
  process.env.MIDSCENE_ANDROID_SCRCPY_VIDEO_BIT_RATE ?? '100000000',
);
const ITERATIONS = Number(
  process.env.MIDSCENE_ANDROID_REMOTE_SCRCPY_ITERATIONS ?? '5',
);
const DIAGNOSTICS_DIR =
  process.env.MIDSCENE_ANDROID_DIAGNOSTICS_DIR ??
  path.resolve('midscene_run/android-remote-scrcpy-diagnostics');
const SETTINGS_HOME = 'com.android.settings/.homepage.SettingsHomepageActivity';
const SETTINGS_DISPLAY =
  'com.android.settings/.Settings$DisplaySettingsActivity';
const NORMALIZED_WIDTH = 180;
const NORMALIZED_HEIGHT = 400;

interface ComparisonResult {
  iteration: number;
  target: 'home' | 'display';
  durationMs: number;
  targetRmse: number;
  oppositeRmse: number;
  adbRmse: number;
  focusedActivity: string;
  scrcpyStatus: ReturnType<AndroidDevice['getScrcpyStatus']>;
}

interface Evidence {
  serial?: string;
  videoBitRate: number;
  iterations: number;
  startedAt: string;
  completedAt?: string;
  device?: {
    model: string;
    androidVersion: string;
    screenSize: string;
    density: string;
  };
  initialScrcpyStatus?: ReturnType<AndroidDevice['getScrcpyStatus']>;
  comparisons: ComparisonResult[];
  error?: string;
}

vi.setConfig({ testTimeout: 240_000, hookTimeout: 30_000 });

function screenshotBuffer(base64: string): Buffer {
  const commaIndex = base64.indexOf(',');
  return Buffer.from(
    commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64,
    'base64',
  );
}

async function normalizedRgb(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(NORMALIZED_WIDTH, NORMALIZED_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
}

async function normalizedRmse(left: Buffer, right: Buffer): Promise<number> {
  const [leftPixels, rightPixels] = await Promise.all([
    normalizedRgb(left),
    normalizedRgb(right),
  ]);
  if (leftPixels.length !== rightPixels.length || leftPixels.length === 0) {
    throw new Error(
      `Unable to compare screenshots: ${leftPixels.length} bytes versus ${rightPixels.length} bytes`,
    );
  }

  let squaredDifference = 0;
  for (let index = 0; index < leftPixels.length; index += 1) {
    const difference = leftPixels[index] - rightPixels[index];
    squaredDifference += difference * difference;
  }
  return Math.sqrt(squaredDifference / leftPixels.length) / 255;
}

function resumedActivity(activityDump: string): string {
  const match = activityDump.match(
    /mResumedActivity:.*?\s([A-Za-z0-9._]+\/[A-Za-z0-9.$]+)\s/,
  );
  if (!match) {
    throw new Error(`Unable to find mResumedActivity in: ${activityDump}`);
  }
  return match[1];
}

const remoteDescribe = RUN_REMOTE_SCRCPY_E2E ? describe : describe.skip;

remoteDescribe('Android remote scrcpy freshness', () => {
  it('never returns the previous Settings page after a visual action', async () => {
    if (!REMOTE_SERIAL) {
      throw new Error(
        'MIDSCENE_ANDROID_REMOTE_SERIAL is required for the remote scrcpy E2E test',
      );
    }
    if (!Number.isFinite(VIDEO_BIT_RATE) || VIDEO_BIT_RATE <= 0) {
      throw new Error(
        `MIDSCENE_ANDROID_SCRCPY_VIDEO_BIT_RATE must be a positive number, received ${String(VIDEO_BIT_RATE)}`,
      );
    }
    if (!Number.isInteger(ITERATIONS) || ITERATIONS <= 0) {
      throw new Error(
        `MIDSCENE_ANDROID_REMOTE_SCRCPY_ITERATIONS must be a positive integer, received ${String(ITERATIONS)}`,
      );
    }

    const evidence: Evidence = {
      serial: REMOTE_SERIAL,
      videoBitRate: VIDEO_BIT_RATE,
      iterations: ITERATIONS,
      startedAt: new Date().toISOString(),
      comparisons: [],
    };
    const device = new AndroidDevice(REMOTE_SERIAL, {
      scrcpyConfig: {
        enabled: true,
        videoBitRate: VIDEO_BIT_RATE,
        idleTimeoutMs: 0,
      },
    });

    await mkdir(DIAGNOSTICS_DIR, { recursive: true });

    try {
      const adb = await device.connect();
      evidence.initialScrcpyStatus = device.getScrcpyStatus();
      expect(evidence.initialScrcpyStatus.enabled).toBe(true);
      expect(evidence.initialScrcpyStatus.connected).toBe(true);

      await Promise.all([
        adb.shell('settings put global window_animation_scale 0'),
        adb.shell('settings put global transition_animation_scale 0'),
        adb.shell('settings put global animator_duration_scale 0'),
        adb.shell('settings put system screen_off_timeout 1800000'),
      ]);
      evidence.device = {
        model: (await adb.shell('getprop ro.product.model')).trim(),
        androidVersion: (
          await adb.shell('getprop ro.build.version.release')
        ).trim(),
        screenSize: (await adb.shell('wm size')).trim(),
        density: (await adb.shell('wm density')).trim(),
      };

      await device.launch(SETTINGS_HOME);
      const homeBase64 = await device.screenshotBase64();
      const homeReference = await (
        adb.takeScreenshot as unknown as () => Promise<Buffer>
      ).call(adb);
      await Promise.all([
        writeFile(
          path.join(DIAGNOSTICS_DIR, 'baseline-home-midscene.jpg'),
          screenshotBuffer(homeBase64),
        ),
        writeFile(
          path.join(DIAGNOSTICS_DIR, 'baseline-home-adb.png'),
          homeReference,
        ),
      ]);

      await device.launch(SETTINGS_DISPLAY);
      const displayBase64 = await device.screenshotBase64();
      const displayReference = await (
        adb.takeScreenshot as unknown as () => Promise<Buffer>
      ).call(adb);
      await Promise.all([
        writeFile(
          path.join(DIAGNOSTICS_DIR, 'baseline-display-midscene.jpg'),
          screenshotBuffer(displayBase64),
        ),
        writeFile(
          path.join(DIAGNOSTICS_DIR, 'baseline-display-adb.png'),
          displayReference,
        ),
      ]);

      for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
        const target = iteration % 2 === 1 ? 'home' : 'display';
        const targetActivity =
          target === 'home' ? SETTINGS_HOME : SETTINGS_DISPLAY;
        const targetReference =
          target === 'home' ? homeReference : displayReference;
        const oppositeReference =
          target === 'home' ? displayReference : homeReference;

        const startedAt = Date.now();
        await device.launch(targetActivity);
        const screenshot = await device.screenshotBase64();
        const durationMs = Date.now() - startedAt;
        const screenshotBytes = screenshotBuffer(screenshot);
        const adbReference = await (
          adb.takeScreenshot as unknown as () => Promise<Buffer>
        ).call(adb);
        const activityDump = await adb.shell('dumpsys activity activities');
        const focusedActivity = resumedActivity(activityDump);
        const [targetRmse, oppositeRmse, adbRmse] = await Promise.all([
          normalizedRmse(screenshotBytes, targetReference),
          normalizedRmse(screenshotBytes, oppositeReference),
          normalizedRmse(screenshotBytes, adbReference),
        ]);

        await Promise.all([
          writeFile(
            path.join(
              DIAGNOSTICS_DIR,
              `${String(iteration).padStart(2, '0')}-${target}-midscene.jpg`,
            ),
            screenshotBytes,
          ),
          writeFile(
            path.join(
              DIAGNOSTICS_DIR,
              `${String(iteration).padStart(2, '0')}-${target}-adb.png`,
            ),
            adbReference,
          ),
        ]);

        evidence.comparisons.push({
          iteration,
          target,
          durationMs,
          targetRmse,
          oppositeRmse,
          adbRmse,
          focusedActivity,
          scrcpyStatus: device.getScrcpyStatus(),
        });

        expect(focusedActivity).toContain(
          target === 'home'
            ? '.homepage.SettingsHomepageActivity'
            : '.Settings$DisplaySettingsActivity',
        );
        expect(adbRmse).toBeLessThan(0.08);
        expect(targetRmse).toBeLessThan(oppositeRmse);
      }
    } catch (error) {
      evidence.error = error instanceof Error ? error.stack : String(error);
      throw error;
    } finally {
      evidence.completedAt = new Date().toISOString();
      await writeFile(
        path.join(DIAGNOSTICS_DIR, 'evidence.json'),
        `${JSON.stringify(evidence, null, 2)}\n`,
      );
      await device.destroy();
    }
  });
});
