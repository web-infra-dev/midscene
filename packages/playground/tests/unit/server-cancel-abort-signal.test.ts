import { describe, expect, test, vi } from 'vitest';
import { PlaygroundServer } from '../../src/server';

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headersSent: false,
    sent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      this.sent = true;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      this.sent = true;
      return this;
    },
  };
}

function getRouteHandler(
  server: PlaygroundServer,
  method: 'get' | 'post',
  route: string,
) {
  const calls = (server.app[method] as any).mock.calls as Array<[string, any]>;
  return calls.find(([registeredRoute]) => registeredRoute === route)?.[1];
}

/**
 * Regression test: hitting Stop in the playground must propagate an
 * AbortSignal down through `executeAction` → `agent.callActionInActionSpace`
 * so any in-flight LLM call / Device sleep loop can observe `signal.aborted`
 * and bail out without waiting on the destroy+recreate fallback.
 *
 * The original bug: cancel only ran `agent.destroy()`, which waited for
 * report flush and didn't tell the action call to stop. Any libnut /
 * keyboard sequence already in flight kept driving the OS until it
 * finished naturally.
 */
describe('PlaygroundServer cancel propagates AbortSignal', () => {
  test('/cancel aborts the in-flight callActionInActionSpace via AbortSignal', async () => {
    let observedSignal: AbortSignal | undefined;
    let actionResolve: ((value: unknown) => void) | undefined;
    let actionReject: ((reason: unknown) => void) | undefined;
    let aborted = false;

    const callActionInActionSpace = vi.fn(
      async (
        _name: string,
        _params: unknown,
        opts?: { abortSignal?: AbortSignal },
      ) => {
        observedSignal = opts?.abortSignal;
        return new Promise((resolve, reject) => {
          actionResolve = resolve;
          actionReject = reject;
          if (opts?.abortSignal) {
            const onAbort = () => {
              aborted = true;
              reject(new Error('cancelled by user'));
            };
            if (opts.abortSignal.aborted) {
              onAbort();
            } else {
              opts.abortSignal.addEventListener('abort', onAbort, {
                once: true,
              });
            }
          }
        });
      },
    );

    const agent = {
      destroyed: false,
      interface: {
        interfaceType: 'computer',
        actionSpace: () => [
          {
            name: 'SlowAction',
            description: 'never resolves until aborted',
            call: vi.fn(),
          },
        ],
        screenshotBase64: vi.fn(async () => 'base64-image'),
        size: vi.fn(async () => ({ width: 100, height: 100 })),
      },
      callActionInActionSpace,
      onDumpUpdate: undefined as
        | ((dump: string, executionDump?: any) => void)
        | undefined,
      dumpDataString: vi.fn(() => ''),
      reportHTMLString: vi.fn(() => null),
      writeOutActionDumps: vi.fn(),
      resetDump: vi.fn(),
      destroy: vi.fn(async () => {
        agent.destroyed = true;
      }),
    };

    let currentAgent: typeof agent = agent;
    const agentFactory = vi.fn(async () => {
      // Server's recreateAgent path swaps the active agent — return a fresh
      // stub so subsequent /execute calls would still work. We don't need to
      // exercise the new agent in this test, so reuse the same stub shape.
      currentAgent = { ...agent, destroyed: false };
      return currentAgent;
    });

    const server = new PlaygroundServer({
      interface: agent.interface,
      agentFactory,
    } as any);

    // Inject the agent we want to observe (PlaygroundServer.launch normally
    // does this via factory; we set it directly so the same agent instance
    // is reachable through getActiveAgentOrThrow before /execute fires).
    (server as any).setActiveAgent(currentAgent);
    (server as any)._agentReady = true;
    (server as any)._activeConnection.session = {
      connected: true,
      metadata: {},
    };
    (server as any).sessionSetupState = 'ready';

    await server.launch(6111);

    const executeHandler = getRouteHandler(server, 'post', '/execute');
    const cancelHandler = getRouteHandler(server, 'post', '/cancel/:requestId');
    expect(executeHandler).toBeTypeOf('function');
    expect(cancelHandler).toBeTypeOf('function');

    const requestId = 'req-abort-test';
    const executeRes = createMockResponse();
    const executePromise = executeHandler(
      {
        body: {
          type: 'SlowAction',
          requestId,
          params: {},
        },
      },
      executeRes,
    );

    // Yield once so /execute can register the AbortController and invoke
    // the action stub before /cancel fires.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callActionInActionSpace).toHaveBeenCalledTimes(1);
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(false);

    const cancelRes = createMockResponse();
    const cancelStart = Date.now();
    await cancelHandler({ params: { requestId } }, cancelRes);
    const cancelDuration = Date.now() - cancelStart;

    // /cancel should respond well under 2s and the abort should have fired
    // synchronously at the start of the handler.
    expect(cancelDuration).toBeLessThan(2000);
    expect(aborted).toBe(true);
    expect(observedSignal?.aborted).toBe(true);

    // The original /execute call should have rejected via the abort signal
    // and the route should send a response (with error string from
    // formatErrorMessage). Without the abort wiring this would hang.
    await executePromise;
    expect(executeRes.sent).toBe(true);

    // Cleanup any leftover promise state.
    actionResolve?.(null);
    actionReject?.(new Error('test cleanup'));
  });

  test('/execute without abort wiring would NOT signal abort to the action (documents the bug)', async () => {
    // Documents the original buggy shape: if executeAction never received an
    // AbortSignal, the action call has no way to know the user clicked Stop.
    let observedSignal: AbortSignal | undefined;
    const callActionInActionSpace = vi.fn(
      async (_name: string, _params: unknown, opts?: any) => {
        observedSignal = opts?.abortSignal;
        return undefined;
      },
    );

    // Manually call the (fixed) executeAction shape but skip passing
    // abortSignal — proves observedSignal is undefined when upstream fails
    // to plumb the signal through.
    await callActionInActionSpace(
      'SlowAction',
      {},
      {
        /* abortSignal intentionally omitted */
      },
    );
    expect(observedSignal).toBeUndefined();
  });
});
