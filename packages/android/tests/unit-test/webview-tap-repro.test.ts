import { describe, expect, it } from 'vitest';
import {
  assertDeterministicResults,
  parseArgs,
  tapCountForRun,
} from '../../scripts/reproduce-webview-first-tap';

describe('WebView first-tap reproduction runner', () => {
  describe('parseArgs', () => {
    it('accepts pnpm separators and parses supported options', () => {
      expect(
        parseArgs([
          '--',
          '--device-id',
          'device-1',
          '--mode',
          'natural',
          '--iterations',
          '3',
          '--wait-ms',
          '250',
          '--no-install',
        ]),
      ).toMatchObject({
        build: true,
        deviceId: 'device-1',
        install: false,
        iterations: 3,
        mode: 'natural',
        waitMs: 250,
      });
    });

    it('uses a supplied APK without rebuilding it', () => {
      const options = parseArgs(['--apk', './fixture.apk']);

      expect(options.build).toBe(false);
      expect(options.apkPath).toMatch(/fixture\.apk$/);
    });

    it.each(['--device-id', '--apk', '--iterations', '--wait-ms', '--mode'])(
      'rejects a missing value for %s',
      (option) => {
        expect(() => parseArgs([option])).toThrow(`${option} requires a value`);
      },
    );

    it('rejects invalid modes and numeric ranges', () => {
      expect(() => parseArgs(['--mode', 'simulated'])).toThrow(
        '--mode must be deterministic or natural',
      );
      expect(() => parseArgs(['--iterations', '0'])).toThrow(
        '--iterations must be a positive integer',
      );
      expect(() => parseArgs(['--wait-ms', '-1'])).toThrow(
        '--wait-ms must be a non-negative number',
      );
    });
  });

  it('reads the latest tap count for an exact run id', () => {
    const logs = [
      'MidsceneTapRepro: run=native.1 tap_count=1',
      'MidsceneTapRepro: run=nativeX1 tap_count=9',
      'MidsceneTapRepro: run=native.1 tap_count=2',
    ].join('\n');

    expect(tapCountForRun(logs, 'native.1')).toBe(2);
    expect(tapCountForRun(logs, 'missing')).toBe(0);
  });

  it('accepts the expected deterministic comparison', () => {
    expect(() =>
      assertDeterministicResults([
        {
          caseName: 'legacy-swipe',
          firstAttemptScreenshot: 'legacy-first.png',
          firstAttemptSwallowed: true,
          firstAttemptTapCount: 0,
          runId: 'legacy-1',
          secondAttemptScreenshot: 'legacy-second.png',
          secondAttemptTapCount: 1,
        },
        {
          caseName: 'native-tap',
          firstAttemptScreenshot: 'native-first.png',
          firstAttemptSwallowed: false,
          firstAttemptTapCount: 1,
          runId: 'native-1',
        },
      ]),
    ).not.toThrow();
  });

  it('rejects legacy swipes that register on the first attempt', () => {
    expect(() =>
      assertDeterministicResults([
        {
          caseName: 'legacy-swipe',
          firstAttemptScreenshot: 'legacy-first.png',
          firstAttemptSwallowed: false,
          firstAttemptTapCount: 1,
          runId: 'legacy-1',
          secondAttemptScreenshot: 'legacy-second.png',
          secondAttemptTapCount: 2,
        },
      ]),
    ).toThrow('Legacy swipe did not reproduce');
  });

  it('rejects native taps that fail on the first attempt', () => {
    expect(() =>
      assertDeterministicResults([
        {
          caseName: 'native-tap',
          firstAttemptScreenshot: 'native-first.png',
          firstAttemptSwallowed: true,
          firstAttemptTapCount: 0,
          runId: 'native-1',
        },
      ]),
    ).toThrow('Native tap did not succeed');
  });
});
