import net from 'node:net';
import { defineAction } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { PlaygroundServer } from '@midscene/playground';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ComputerAgent, ComputerDevice } from '../../src';

// PlaygroundServer initializes ModelConfigManager on first use, which throws
// when MIDSCENE_MODEL_NAME is unset. The SlowAction below never calls a model,
// so dummy values just satisfy startup validation — required on headless CI
// where no model env is provided.
process.env.MIDSCENE_MODEL_NAME =
  process.env.MIDSCENE_MODEL_NAME || 'noop-cancel-test';
process.env.MIDSCENE_MODEL_BASE_URL =
  process.env.MIDSCENE_MODEL_BASE_URL || 'http://127.0.0.1:1/v1';
process.env.MIDSCENE_MODEL_API_KEY =
  process.env.MIDSCENE_MODEL_API_KEY || 'noop';
// PlaygroundServer also calls throwErrorIfNonVLModel before dispatching
// customActions; any valid VL family makes the check pass.
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
 * Regression test for the playground Stop bug:
 * After running a long action then clicking Stop, the in-flight task must
 * cooperatively abort instead of running its sleep loop to completion. We
 * exercise this end-to-end against a real PlaygroundServer + ComputerAgent on
 * a Linux Xvfb display.
 *
 * The driver is a `SlowAction` that sleeps for 60s while watching the
 * ExecutorContext.abortSignal — covers the abort propagation chain
 * (server → executeAction → callActionInActionSpace → tasks → device action
 * call) without needing a live LLM.
 *
 * Why the assertions look the way they do:
 *  - `cancelDuration < 2000ms` — the /cancel route itself must respond fast.
 *  - `executeBody.error` contains "abort" — the SlowAction call rejected via
 *    the abort signal, not by the natural 60s timer. This is the regression
 *    signal: with the bug, the route stays open for a full 60s and the error
 *    string never mentions abort.
 *  - `executeBody` arrives within 25s — sanity check that we're nowhere near
 *    the 60s natural timeout, while staying tolerant of the destroy/dump tail
 *    that runs after the abort propagates.
 */
describe.runIf(process.platform === 'linux')(
  'playground cancel propagation (headless linux)',
  () => {
    let agent: ComputerAgent;
    let device: ComputerDevice;
    let server: PlaygroundServer;
    let port: number;

    const tapSpy = vi.fn();
    const typeTextSpy = vi.fn();

    beforeAll(async () => {
      const slowAction = defineAction({
        name: 'SlowAction',
        description: 'sleeps for 60s but bails out the moment abort fires',
        call: async (_param: unknown, context) => {
          // Simulate a long-running OS-level sequence. The wrapping task
          // executor injects context.abortSignal; if abort propagates the
          // promise rejects within ~10ms, otherwise the test times out.
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 60_000);
            if (context.abortSignal) {
              if (context.abortSignal.aborted) {
                clearTimeout(timer);
                reject(new Error('SlowAction aborted'));
                return;
              }
              context.abortSignal.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  reject(new Error('SlowAction aborted'));
                },
                { once: true },
              );
            }
          });
        },
      });

      device = new ComputerDevice({
        customActions: [slowAction],
      });
      await device.connect();

      // Wrap the libnut-backed primitives with spies so we can prove no
      // stray pointer/keyboard events fire after /cancel returns.
      const originalTap = device.inputPrimitives.pointer.tap.bind(
        device.inputPrimitives.pointer,
      );
      const originalTypeText = device.inputPrimitives.keyboard.typeText.bind(
        device.inputPrimitives.keyboard,
      );
      device.inputPrimitives.pointer.tap = vi.fn(async (...args) => {
        tapSpy(...args);
        return originalTap(...args);
      });
      device.inputPrimitives.keyboard.typeText = vi.fn(async (...args) => {
        typeTextSpy(...args);
        return originalTypeText(...args);
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
        // best-effort — destroy may already have been called by /cancel
      }
    });

    it('aborts SlowAction within 25s of /cancel and never via natural timeout', async () => {
      const requestId = 'cancel-regression-1';

      const executePromise = fetch(`http://127.0.0.1:${port}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'SlowAction',
          requestId,
          params: {},
        }),
      }).then((res) => res.json());

      // Give /execute time to register the AbortController and start
      // the SlowAction promise inside the task executor.
      await sleep(500);

      const cancelStart = Date.now();
      const cancelRes = await fetch(
        `http://127.0.0.1:${port}/cancel/${requestId}`,
        { method: 'POST' },
      );
      const cancelBody = (await cancelRes.json()) as { status?: string };
      const cancelDuration = Date.now() - cancelStart;

      expect(cancelRes.status).toBe(200);
      expect(cancelBody.status).toBe('cancelled');
      // /cancel route must respond fast — independent of how slow the
      // post-abort destroy/dump tail is on /execute.
      expect(cancelDuration).toBeLessThan(2000);

      // /execute must resolve well before the 60s natural timer would expire,
      // and the error string must mention abort — proving the rejection came
      // from the cooperative cancel chain, not from the natural setTimeout.
      const executeBody = (await Promise.race([
        executePromise,
        sleep(25_000).then(() => null),
      ])) as { error?: string | null } | null;
      expect(
        executeBody,
        'execute did not resolve within 25s after cancel — abort signal did not propagate',
      ).not.toBeNull();
      const errorString = String(executeBody?.error ?? '').toLowerCase();
      expect(errorString).toMatch(/abort|cancel/);

      // Reset spies, then wait 1s and assert no further OS-level
      // pointer/keyboard activity slipped through after cancellation.
      const tapCallsAtCancel = tapSpy.mock.calls.length;
      const typeCallsAtCancel = typeTextSpy.mock.calls.length;
      await sleep(1000);
      expect(tapSpy.mock.calls.length).toBe(tapCallsAtCancel);
      expect(typeTextSpy.mock.calls.length).toBe(typeCallsAtCancel);
    });

    it('subsequent /execute reports no active session after cancel (instance mode)', async () => {
      // After /cancel destroys the agent and we're in instance mode (no
      // factory), the next /execute should fail fast with "No active
      // session" instead of hanging or driving the OS again. We mostly
      // care that the response arrives quickly and isn't a 200 success
      // — that confirms the destroy path actually tore the agent down.
      const requestId = 'cancel-regression-2';
      const start = Date.now();
      const res = await fetch(`http://127.0.0.1:${port}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'SlowAction',
          requestId,
          params: {},
        }),
      });
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
      expect(res.status).not.toBe(200);
    });
  },
);

/**
 * L4 regression: ComputerDevice.destroy() must abort *in-flight* libnut
 * input sequences (smoothMoveMouse, abortableSleep, etc.), not just refuse
 * new ones. The earlier SlowAction test exercises L1-L3 (server → core agent
 * cooperative abort) but never touches the device's pointer/keyboard
 * primitives, so it can't catch a regression that only breaks L4.
 *
 * Strategy:
 *  - A `LongTapLoop` customAction runs `device.inputPrimitives.pointer.tap`
 *    30 times back-to-back. It deliberately does NOT listen to
 *    context.abortSignal — we want the *device* to be what stops the loop.
 *  - We wrap pointer.tap with a spy so we can count how many taps were
 *    actually attempted.
 *  - After /cancel, the in-flight tap's internal smoothMoveMouse loop must
 *    bail out via abortableSleep, the tap must throw, the customAction's
 *    `for` loop catches and exits → tap count stops growing.
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
      // typically takes ~100-200ms.
      await sleep(2000);

      const tapsAfterCancel = tapSpy.mock.calls.length;
      const newTaps = tapsAfterCancel - tapsAtCancel;

      // With L4: at most 1 extra tap may have been entered before destroyed
      // gating kicked in; subsequent loop iterations are blocked.
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
