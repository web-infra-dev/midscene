/**
 * Transport contract tests (P1-1).
 *
 * Every backend must satisfy the same behavioural contract, so the suite is
 * written once against the public `AndroidTransport` surface and instantiated
 * per backend. Anything a backend cannot do must fail loudly with a typed error
 * rather than silently returning a blank value.
 */
import { describe, expect, test } from '@rstest/core';

import type { FakeCommandResponse } from '../../src/transport/command-runner';
import type { AndroidTransport } from '../../src/transport/types';

export interface ContractHarness {
  /** Name shown in the test titles. */
  name: string;
  /** Build a transport plus the responses its backend will consume. */
  create: (responses: FakeCommandResponse[]) => AndroidTransport;
  /**
   * Backend-specific command responses for a healthy device. Kept per backend
   * because argv shapes legitimately differ (adb vs rish vs file system).
   */
  healthy: () => FakeCommandResponse[];
  /** Response set for a device that denies shell access. */
  unprivileged?: () => FakeCommandResponse[];
}

interface TransportChecks {
  deviceId: number | null;
  capabilitiesHealthy: boolean;
}

function createChecks(name: string): TransportChecks {
  return { deviceId: null, capabilitiesHealthy: false };
}

/** Registers the shared contract suite; call once per backend. */
export function describeTransportContract(harness: ContractHarness): void {
  describe(`${harness.name} satisfies the AndroidTransport contract`, () => {
    createChecks(harness.name);

    test('reports capabilities without throwing when the device is healthy', async () => {
      const transport = harness.create(harness.healthy());

      const capabilities = await transport.getCapabilities();

      expect(capabilities.backend).toBe(transport.backend);
      expect(capabilities.shell).toBe(true);
      expect(capabilities.textInput).toBe('ascii-only');
    });

    test('reports a healthy channel with a privileged uid', async () => {
      const transport = harness.create(harness.healthy());

      const health = await transport.healthCheck();

      expect(health.ok).toBe(true);
      expect(health.uid).toBe(2000);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test('never throws from healthCheck when the channel is broken', async () => {
      const transport = harness.create([
        {
          match: [],
          failure: { kind: 'spawn-failed', message: 'no device' },
        },
      ]);

      const health = await transport.healthCheck();

      expect(health.ok).toBe(false);
      expect(health.error).toBeDefined();
    });

    test('returns image bytes for a screenshot', async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const transport = harness.create([
        ...harness.healthy(),
        { match: ['screencap'], stdout: png },
      ]);

      const buffer = await transport.screenshot();

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 4).equals(png.subarray(0, 4))).toBe(true);
    });

    test('rejects a non-image screenshot payload', async () => {
      const transport = harness.create([
        ...harness.healthy(),
        { match: ['screencap'], stdout: 'not an image' },
      ]);

      const error = await transport
        .screenshot()
        .catch((caught: unknown) => caught);

      expect((error as { code?: string }).code).toBe('ScreenshotFailed');
    });

    test('reports display geometry with a default display', async () => {
      const transport = harness.create(harness.healthy());

      const displays = await transport.listDisplays();
      const info = await transport.getDisplayInfo();

      expect(displays.length).toBeGreaterThan(0);
      expect(info.isDefault).toBe(true);
      expect(info.width).toBeGreaterThan(0);
      expect(info.height).toBeGreaterThan(0);
    });

    test('rejects an unknown display id as an invalid argument', async () => {
      const transport = harness.create(harness.healthy());

      const error = await transport
        .getDisplayInfo({ displayId: 999 })
        .catch((caught: unknown) => caught);

      expect((error as { code?: string }).code).toBe('InvalidArgument');
    });

    test('drives input through the backend', async () => {
      const transport = harness.create([
        ...harness.healthy(),
        { match: ['input'], stdout: '' },
      ]);

      await expect(transport.tap(10, 20)).resolves.toBeUndefined();
      await expect(
        transport.swipe({ x: 1, y: 2 }, { x: 3, y: 4 }),
      ).resolves.toBeUndefined();
      await expect(transport.keyEvent(4)).resolves.toBeUndefined();
      await expect(transport.inputText('hello world')).resolves.toBeUndefined();
    });

    test('refuses non-ASCII text instead of typing nothing', async () => {
      const transport = harness.create([
        ...harness.healthy(),
        { match: ['input'], stdout: '' },
      ]);

      const error = await transport
        .inputText('中文')
        .catch((caught: unknown) => caught);

      expect((error as { code?: string }).code).toBe('NotSupported');
    });

    test('rejects invalid arguments before touching the device', async () => {
      const transport = harness.create(harness.healthy());

      const failures = await Promise.all([
        transport.tap(Number.NaN, 0).catch((caught: unknown) => caught),
        transport.keyEvent(0).catch((caught: unknown) => caught),
        transport.forceStop('').catch((caught: unknown) => caught),
      ]);

      for (const failure of failures) {
        expect((failure as { code?: string }).code).toBe('InvalidArgument');
      }
    });

    test('starts activities and force-stops packages', async () => {
      const transport = harness.create([
        ...harness.healthy(),
        { match: ['am start'], stdout: '' },
        { match: ['am force-stop'], stdout: '' },
        { match: ['monkey'], stdout: '' },
      ]);

      await expect(
        transport.startActivity({
          packageName: 'com.android.settings',
          activity: '.Settings',
        }),
      ).resolves.toBeUndefined();
      await expect(
        transport.startActivity({
          packageName: 'com.example.app',
          uri: 'example://open',
        }),
      ).resolves.toBeUndefined();
      await expect(
        transport.startActivity({ packageName: 'com.example.app' }),
      ).resolves.toBeUndefined();
      await expect(
        transport.forceStop('com.example.app'),
      ).resolves.toBeUndefined();
    });

    test('rejects every operation after close', async () => {
      const transport = harness.create(harness.healthy());
      await transport.close();

      const failures = await Promise.all([
        transport.tap(1, 2).catch((caught: unknown) => caught),
        transport.getCapabilities().catch((caught: unknown) => caught),
        transport.listDisplays().catch((caught: unknown) => caught),
        transport.screenshot().catch((caught: unknown) => caught),
      ]);

      for (const failure of failures) {
        expect((failure as { code?: string }).code).toBe('ServiceUnavailable');
      }
    });

    test('raises typed errors, never blank values, when a command fails', async () => {
      // Only the failing command is scripted: a healthy catch-all would win the
      // first-match lookup and hide the failure.
      const transport = harness.create([
        { match: ['input'], exitCode: 1, stderr: 'SecurityException' },
      ]);

      const error = await transport
        .tap(1, 2)
        .catch((caught: unknown) => caught);

      expect((error as { code?: string }).code).toBe('CommandFailed');
      expect((error as Error).message).toContain('tap failed');
    });
  });
}
