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
