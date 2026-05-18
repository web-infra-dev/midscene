import { describe, expect, test, vi } from 'vitest';
import { PlaygroundServer } from '../../src/server';

function createMockStreamResponse() {
  const headers = new Map<string, string>();
  const chunks: Array<string | Buffer> = [];

  return {
    headersSent: false,
    destroyed: false,
    headers,
    chunks,
    setHeader(key: string, value: string) {
      headers.set(key, value);
      return this;
    },
    write(chunk: string | Buffer) {
      this.headersSent = true;
      chunks.push(chunk);
      return true;
    },
    destroy() {
      this.destroyed = true;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    statusCode: 200,
    body: undefined as unknown,
  };
}

function createMockRequest() {
  const listeners = new Map<string, () => void>();
  return {
    query: {},
    listeners,
    on(event: string, listener: () => void) {
      listeners.set(event, listener);
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

describe('PlaygroundServer MJPEG streaming', () => {
  test('GET /screenshot recreates a factory-backed agent when the page session is closed', async () => {
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const agentFactory = vi
      .fn()
      .mockResolvedValueOnce({
        destroy: firstDestroy,
        interface: {
          interfaceType: 'web',
          actionSpace: () => [],
          screenshotBase64: async () => {
            throw new Error(
              'Protocol error (Page.captureScreenshot): Session closed. Most likely the page has been closed.',
            );
          },
        },
      })
      .mockResolvedValueOnce({
        destroy: secondDestroy,
        interface: {
          interfaceType: 'web',
          actionSpace: () => [],
          screenshotBase64: async () =>
            Buffer.from('recovered-screenshot').toString('base64'),
        },
      });

    const server = new PlaygroundServer(agentFactory as any);
    await server.launch(6124);
    const screenshotHandler = getRouteHandler(server, 'get', '/screenshot');
    const response = createMockStreamResponse();

    await screenshotHandler(createMockRequest(), response);

    expect(agentFactory).toHaveBeenCalledTimes(2);
    expect(firstDestroy).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      screenshot: Buffer.from('recovered-screenshot').toString('base64'),
    });
  });

  test('GET /mjpeg recreates a factory-backed agent when interface stream startup sees a closed page', async () => {
    const firstDestroy = vi.fn();
    const stop = vi.fn();
    const agentFactory = vi
      .fn()
      .mockResolvedValueOnce({
        destroy: firstDestroy,
        interface: {
          interfaceType: 'web',
          actionSpace: () => [],
          screenshotBase64: async () => {
            throw new Error('polling should not be used after recovery');
          },
          startMjpegStream: async () => {
            throw new Error('Protocol error: Session closed.');
          },
        },
      })
      .mockResolvedValueOnce({
        interface: {
          interfaceType: 'web',
          actionSpace: () => [],
          screenshotBase64: async () => {
            throw new Error('polling should not be used');
          },
          startMjpegStream: async ({ onFrame }) => {
            onFrame({
              data: Buffer.from('recovered-frame').toString('base64'),
              contentType: 'image/jpeg',
            });
            return { stop };
          },
        },
      });

    const server = new PlaygroundServer(agentFactory as any);
    await server.launch(6125);
    vi.useFakeTimers();
    const mjpegHandler = getRouteHandler(server, 'get', '/mjpeg');
    try {
      const request = createMockRequest();
      const response = createMockStreamResponse();

      await mjpegHandler(request, response);

      expect(agentFactory).toHaveBeenCalledTimes(2);
      expect(firstDestroy).toHaveBeenCalledTimes(1);
      expect(
        response.chunks.some((chunk) => chunk.toString() === 'recovered-frame'),
      ).toBe(true);

      request.listeners.get('close')?.();
      await vi.advanceTimersByTimeAsync(2000);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('GET /mjpeg streams frames from an interface MJPEG producer', async () => {
    const stop = vi.fn();
    let capturedSignal: AbortSignal | undefined;
    const startMjpegStream = vi.fn(async ({ signal, onFrame }) => {
      capturedSignal = signal;
      onFrame({
        data: Buffer.from('frame-one').toString('base64'),
        contentType: 'image/jpeg',
      });
      return { stop };
    });

    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        screenshotBase64: async () => {
          throw new Error('polling should not be used');
        },
        size: async () => ({ width: 800, height: 600 }),
        startMjpegStream,
      },
    } as any);

    await server.launch(6120);
    vi.useFakeTimers();
    const mjpegHandler = getRouteHandler(server, 'get', '/mjpeg');
    try {
      expect(mjpegHandler).toBeTypeOf('function');

      const request = createMockRequest();
      const response = createMockStreamResponse();
      await mjpegHandler(request, response);

      expect(startMjpegStream).toHaveBeenCalledTimes(1);
      expect(response.headers.get('Content-Type')).toBe(
        'multipart/x-mixed-replace; boundary=mjpeg-boundary',
      );
      expect(response.headers.get('Cache-Control')).toBe(
        'no-cache, no-store, must-revalidate',
      );
      expect(
        response.chunks.map((chunk) => chunk.toString()).join(''),
      ).toContain('Content-Type: image/jpeg');
      expect(
        response.chunks.some((chunk) => chunk.toString() === 'frame-one'),
      ).toBe(true);

      request.listeners.get('close')?.();
      expect(capturedSignal?.aborted).toBe(false);
      expect(stop).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      expect(capturedSignal?.aborted).toBe(true);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('GET /mjpeg evicts stale subscribers when a new one attaches', async () => {
    // Chromium's <img> with multipart/x-mixed-replace keeps the underlying
    // TCP connection alive even after the element is unmounted, never
    // sending FIN. To stop those zombie sockets from eating the per-origin
    // connection pool, a new /mjpeg request destroys any existing
    // subscriber responses for the same producer.
    const stop = vi.fn();
    let emitFrame:
      | ((frame: { data: string; contentType: string }) => void)
      | undefined;
    const startMjpegStream = vi.fn(async ({ onFrame }) => {
      emitFrame = onFrame;
      onFrame({
        data: Buffer.from('frame-one').toString('base64'),
        contentType: 'image/jpeg',
      });
      return { stop };
    });

    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        screenshotBase64: async () => {
          throw new Error('polling should not be used');
        },
        size: async () => ({ width: 800, height: 600 }),
        startMjpegStream,
      },
    } as any);

    await server.launch(6123);
    vi.useFakeTimers();
    try {
      const mjpegHandler = getRouteHandler(server, 'get', '/mjpeg');
      const requestOne = createMockRequest();
      const requestTwo = createMockRequest();
      const responseOne = createMockStreamResponse();
      const responseTwo = createMockStreamResponse();

      await mjpegHandler(requestOne, responseOne);
      expect(
        responseOne.chunks.some((chunk) => chunk.toString() === 'frame-one'),
      ).toBe(true);

      // Second mount on the same producer (e.g. user navigates back to the
      // device view, React StrictMode double-mount, retry timer) — the old
      // subscriber's response is destroyed so its socket releases the
      // Chromium connection-pool slot.
      await mjpegHandler(requestTwo, responseTwo);
      expect(startMjpegStream).toHaveBeenCalledTimes(1);
      expect(responseOne.destroyed).toBe(true);
      expect(
        responseTwo.chunks.some((chunk) => chunk.toString() === 'frame-one'),
      ).toBe(true);

      // New frames only reach the surviving subscriber.
      emitFrame?.({
        data: Buffer.from('frame-two').toString('base64'),
        contentType: 'image/jpeg',
      });
      expect(
        responseOne.chunks.some((chunk) => chunk.toString() === 'frame-two'),
      ).toBe(false);
      expect(
        responseTwo.chunks.some((chunk) => chunk.toString() === 'frame-two'),
      ).toBe(true);

      requestTwo.listeners.get('close')?.();
      await vi.advanceTimersByTimeAsync(2000);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('GET /mjpeg falls back to screenshot polling when producer startup fails', async () => {
    const screenshotBase64 = vi.fn(async () =>
      Buffer.from('polling-frame').toString('base64'),
    );
    const startMjpegStream = vi.fn(async () => {
      throw new Error('CDP unavailable');
    });

    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        screenshotBase64,
        size: async () => ({ width: 800, height: 600 }),
        startMjpegStream,
      },
    } as any);

    await server.launch(6121);
    const mjpegHandler = getRouteHandler(server, 'get', '/mjpeg');
    const request = createMockRequest();
    const response = createMockStreamResponse();

    const streamPromise = mjpegHandler(request, response);
    for (let i = 0; i < 10 && screenshotBase64.mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(screenshotBase64).toHaveBeenCalled();
    request.listeners.get('close')?.();
    await streamPromise;

    expect(startMjpegStream).toHaveBeenCalledTimes(1);
    expect(response.chunks.map((chunk) => chunk.toString()).join('')).toContain(
      'polling-frame',
    );
  });

  test('GET /mjpeg falls back to screenshot polling when producer emits no initial frame', async () => {
    const stop = vi.fn();
    const screenshotBase64 = vi.fn(async () =>
      Buffer.from('polling-after-empty-stream').toString('base64'),
    );
    const startMjpegStream = vi.fn(async () => ({ stop }));

    const server = new PlaygroundServer({
      interface: {
        interfaceType: 'web',
        actionSpace: () => [],
        screenshotBase64,
        size: async () => ({ width: 800, height: 600 }),
        startMjpegStream,
      },
    } as any);

    await server.launch(6122);
    vi.useFakeTimers();
    try {
      const mjpegHandler = getRouteHandler(server, 'get', '/mjpeg');
      const request = createMockRequest();
      const response = createMockStreamResponse();

      const streamPromise = mjpegHandler(request, response);
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();

      expect(startMjpegStream).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalled();
      expect(screenshotBase64).toHaveBeenCalled();
      expect(
        response.chunks.map((chunk) => chunk.toString()).join(''),
      ).toContain('polling-after-empty-stream');

      request.listeners.get('close')?.();
      await vi.runOnlyPendingTimersAsync();
      await streamPromise;
    } finally {
      vi.useRealTimers();
    }
  });
});
