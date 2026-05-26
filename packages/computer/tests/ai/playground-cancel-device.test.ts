import net from 'node:net';
import { defineAction } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { PlaygroundServer } from '@midscene/playground';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ComputerAgent, ComputerDevice } from '../../src';

// PlaygroundServer initializes ModelConfigManager on first use, which throws
// when MIDSCENE_MODEL_NAME is unset. The LongTapLoop below never calls a
// model, so dummy values just satisfy startup validation — required on
// headless CI where no model env is provided.
process.env.MIDSCENE_MODEL_NAME =
  process.env.MIDSCENE_MODEL_NAME || 'noop-cancel-device-test';
process.env.MIDSCENE_MODEL_BASE_URL =
  process.env.MIDSCENE_MODEL_BASE_URL || 'http://127.0.0.1:1/v1';
process.env.MIDSCENE_MODEL_API_KEY =
  process.env.MIDSCENE_MODEL_API_KEY || 'noop';
process.env.MIDSCENE_MODEL_FAMILY =
  process.env.MIDSCENE_MODEL_FAMILY || 'qwen3-vl';

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const address = srv.address();
      if (typeof address === 'object' && address) {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error('Failed to acquire free port'));
      }
    });
  });
}

vi.setConfig({
  testTimeout: 90 * 1000,
});

/**
 * L4 regression: ComputerDevice.destroy() must abort *in-flight* libnut
 * input sequences (smoothMoveMouse, abortableSleep, etc.), not just refuse
 * new ones. The sibling playground-cancel.test.ts exercises L1-L3 (server →
 * core agent cooperative abort) via a SlowAction customAction that listens
 * to context.abortSignal directly. That suite cannot catch a regression
 * that only breaks L4, because SlowAction never touches device
 * pointer/keyboard primitives.
 *
 * This file lives separately so it gets its own vitest worker (and its own
 * Xvfb display) — wedging L4 into the SlowAction file as a second
 * `describe` caused the second `device.connect()` to crash the worker
 * after the first describe's `agent.destroy()` had already torn down
 * Xvfb on display :99.
 *
 * Strategy:
 *  - LongTapLoop customAction runs `device.inputPrimitives.pointer.tap`
 *    30 times back-to-back. It deliberately does NOT listen to
 *    context.abortSignal — we want the *device* to be what stops the loop.
 *  - We wrap pointer.tap with a spy so we can count attempted taps.
 *  - After /cancel, the in-flight tap's internal smoothMoveMouse must
 *    bail via abortableSleep, the tap throws, the customAction's `for`
 *    loop catches and exits → tap count stops growing.
 *  - Without L4: smoothMoveMouse keeps sleeping naturally, every tap
 *    completes, the loop runs all 30 iterations after cancel.
 */
describe.runIf(process.platform === 'linux')(
  'L4 device-level abort propagation (headless linux)',
  () => {
    let agent: ComputerAgent;
    let device: ComputerDevice;
    let server: PlaygroundServer;
    let port: number;
    const tapSpy = vi.fn();
    let deviceRef!: ComputerDevice;

    beforeAll(async () => {
      const longTapLoop = defineAction({
        name: 'LongTapLoop',
        description:
          'taps 30 different points back-to-back; relies on device.destroy() to interrupt the loop mid-sequence',
        call: async () => {
          // Deliberately no abortSignal listening here — L4 is what we test.
          for (let i = 0; i < 30; i++) {
            await deviceRef.inputPrimitives.pointer.tap({
              x: 100 + i * 5,
              y: 100 + i * 5,
            });
          }
        },
      });

      device = new ComputerDevice({ customActions: [longTapLoop] });
      deviceRef = device;
      await device.connect();

      const originalTap = device.inputPrimitives.pointer.tap.bind(
        device.inputPrimitives.pointer,
      );
      device.inputPrimitives.pointer.tap = vi.fn(async (...args) => {
        tapSpy(...args);
        return originalTap(...args);
      });

      agent = new ComputerAgent(device);
      server = new PlaygroundServer(agent);
      port = await getFreePort();
      await server.launch(port);
    });

    afterAll(async () => {
      try {
        if (server.server) {
          await new Promise<void>((resolve) =>
            server.server!.close(() => resolve()),
          );
        }
      } catch {
        // best-effort
      }
      try {
        await agent?.destroy();
      } catch {
        // best-effort
      }
    });

    it('aborts in-flight device.tap loop within 2s of /cancel', async () => {
      const requestId = 'l4-tap-loop';
      tapSpy.mockClear();

      const executePromise = fetch(`http://127.0.0.1:${port}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'LongTapLoop',
          requestId,
          params: {},
        }),
      }).then((res) => res.json());

      // Let LongTapLoop get a handful of taps in. Each tap is
      // smoothMoveMouse (multiple steps with delays) + click hold, so
      // 500ms is enough to be mid-loop but well short of 30 iterations.
      await sleep(500);
      const tapsAtCancel = tapSpy.mock.calls.length;
      expect(
        tapsAtCancel,
        'expected LongTapLoop to have fired at least one tap before cancel',
      ).toBeGreaterThan(0);

      await fetch(`http://127.0.0.1:${port}/cancel/${requestId}`, {
        method: 'POST',
      });

      // Give the in-flight tap time to either bail (fix) or run to completion
      // and start the next one (bug). 2s is generous: a single tap on Xvfb
      // typically takes ~100-200ms, so the loop could fire many more taps
      // in that window without L4.
      await sleep(2000);

      const tapsAfterCancel = tapSpy.mock.calls.length;
      const newTaps = tapsAfterCancel - tapsAtCancel;

      // With L4: at most 1 extra tap may have been entered before the
      // destroyed gating kicked in; subsequent loop iterations are blocked.
      // Without L4: the loop runs through to (or close to) 30 iterations.
      expect(
        newTaps,
        `expected at most 1 extra tap after cancel; observed ${newTaps} (taps at cancel: ${tapsAtCancel}, after 2s: ${tapsAfterCancel}). If this is significantly larger, device-level abort is broken.`,
      ).toBeLessThanOrEqual(1);

      // Drain the execute promise so vitest doesn't dangle.
      await executePromise.catch(() => undefined);
    });
  },
);
