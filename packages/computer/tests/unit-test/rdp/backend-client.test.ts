import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  HelperProcessRDPBackendClient,
  type RDPHelperRequest,
  type RDPHelperResponse,
} from '../../../src';

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  pid = 4242;
  exitCode: number | null = null;
  killed = false;
  private nextStdinWriteError?: Error;

  constructor() {
    super();
    this.stdin.setDefaultEncoding('utf8');
    const originalWrite = this.stdin.write.bind(this.stdin) as (
      ...args: unknown[]
    ) => boolean;
    this.stdin.write = ((...args: unknown[]) => {
      if (this.nextStdinWriteError) {
        const error = this.nextStdinWriteError;
        this.nextStdinWriteError = undefined;
        const callback = args.findLast((arg) => typeof arg === 'function') as
          | ((error?: Error | null) => void)
          | undefined;
        queueMicrotask(() => {
          callback?.(error);
        });
        return false;
      }

      return originalWrite(...args);
    }) as PassThrough['write'];
    const originalEnd = this.stdin.end.bind(this.stdin);
    this.stdin.end = ((...args: Parameters<PassThrough['end']>) => {
      const result = originalEnd(...args);
      if (this.exitCode === null) {
        this.exitCode = 0;
        setImmediate(() => {
          this.emit('exit', 0, null);
        });
      }
      return result;
    }) as PassThrough['end'];
  }

  failNextStdinWrite(error: Error): void {
    this.nextStdinWriteError = error;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    if (this.exitCode === null) {
      this.exitCode = typeof signal === 'number' ? signal : 1;
      setImmediate(() => {
        this.emit('exit', this.exitCode, signal ?? null);
      });
    }
    return true;
  }
}

function createClientWithChild() {
  const child = new FakeChildProcess();
  const client = new HelperProcessRDPBackendClient({
    spawnFn: () => child as any,
    helperPath: '/fake/rdp-helper',
  });
  return {
    child,
    client,
  };
}

function onNextRequest(
  child: FakeChildProcess,
  handler: (request: RDPHelperRequest) => void,
) {
  child.stdin.once('data', (chunk) => {
    handler(JSON.parse(chunk.toString()) as RDPHelperRequest);
  });
}

function writeResponse(child: FakeChildProcess, response: RDPHelperResponse) {
  child.stdout.write(`${JSON.stringify(response)}\n`);
}

describe('HelperProcessRDPBackendClient', () => {
  it('parses successful helper responses', async () => {
    const { child, client } = createClientWithChild();

    onNextRequest(child, (request) => {
      expect(request.payload.type).toBe('connect');
      writeResponse(child, {
        id: request.id,
        ok: true,
        payload: {
          type: 'connected',
          info: {
            sessionId: 'session-1',
            server: '10.75.166.249:3389',
            size: { width: 1280, height: 720 },
          },
        },
      });
    });

    await expect(
      client.connect({
        host: '10.75.166.249',
        username: 'Admin',
      }),
    ).resolves.toEqual({
      sessionId: 'session-1',
      server: '10.75.166.249:3389',
      size: { width: 1280, height: 720 },
    });
  });

  it('normalizes bracketed IPv6 hosts before sending helper connect requests', async () => {
    const { child, client } = createClientWithChild();

    onNextRequest(child, (request) => {
      const { payload } = request;
      if (payload.type !== 'connect') {
        throw new Error(`Expected connect request, got ${payload.type}`);
      }
      expect(payload.config).toEqual(
        expect.objectContaining({
          host: '2001:db8::42',
          port: 3390,
        }),
      );
      writeResponse(child, {
        id: request.id,
        ok: true,
        payload: {
          type: 'connected',
          info: {
            sessionId: 'session-ipv6',
            server: '[2001:db8::42]:3390',
            size: { width: 1280, height: 720 },
          },
        },
      });
    });

    await expect(
      client.connect({
        host: '[2001:db8::42]',
        port: 3390,
        username: 'Admin',
      }),
    ).resolves.toEqual({
      sessionId: 'session-ipv6',
      server: '[2001:db8::42]:3390',
      size: { width: 1280, height: 720 },
    });
  });

  it('forwards localAddress in helper connect requests', async () => {
    const { child, client } = createClientWithChild();

    onNextRequest(child, (request) => {
      const { payload } = request;
      if (payload.type !== 'connect') {
        throw new Error(`Expected connect request, got ${payload.type}`);
      }
      expect(payload.config).toEqual(
        expect.objectContaining({
          host: '10.75.166.249',
          localAddress: '10.75.166.10',
        }),
      );
      writeResponse(child, {
        id: request.id,
        ok: true,
        payload: {
          type: 'connected',
          info: {
            sessionId: 'session-local-address',
            server: '10.75.166.249:3389',
            size: { width: 1280, height: 720 },
          },
        },
      });
    });

    await expect(
      client.connect({
        host: '10.75.166.249',
        localAddress: '10.75.166.10',
        username: 'Admin',
      }),
    ).resolves.toEqual({
      sessionId: 'session-local-address',
      server: '10.75.166.249:3389',
      size: { width: 1280, height: 720 },
    });
  });

  it('rejects structured helper errors', async () => {
    const { child, client } = createClientWithChild();

    onNextRequest(child, (request) => {
      expect(request.payload.type).toBe('connect');
      writeResponse(child, {
        id: request.id,
        ok: false,
        error: {
          code: 'connect_failed',
          message: 'Authentication failed',
        },
      });
    });

    await expect(
      client.connect({
        host: '10.75.166.249',
        username: 'Admin',
      }),
    ).rejects.toThrow('Authentication failed');
  });

  it('rejects all pending requests if the helper exits unexpectedly', async () => {
    const { child, client } = createClientWithChild();

    const connectPromise = client.connect({
      host: '10.75.166.249',
      username: 'Admin',
    });
    const screenshotPromise = client.screenshotBase64();

    setImmediate(() => {
      child.exitCode = 1;
      child.emit('exit', 1, null);
    });

    await expect(connectPromise).rejects.toThrow(
      'RDP helper exited unexpectedly',
    );
    await expect(screenshotPromise).rejects.toThrow(
      'RDP helper exited unexpectedly',
    );
  });

  it('rejects pending requests if the helper stdin pipe breaks', async () => {
    const { child, client } = createClientWithChild();

    onNextRequest(child, () => {
      child.stdin.emit(
        'error',
        Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }),
      );
    });

    await expect(
      client.connect({
        host: '10.75.166.249',
        username: 'Admin',
      }),
    ).rejects.toThrow('RDP helper stdin stream error: write EPIPE');
    expect(child.killed).toBe(true);
  });

  it('includes helper diagnostics when the first connect write fails after early helper exit', async () => {
    const { child, client } = createClientWithChild();
    child.failNextStdinWrite(
      Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }),
    );

    setImmediate(() => {
      child.stderr.write(
        'error while loading shared libraries: libfreerdp2.so: cannot open shared object file',
      );
      child.exitCode = 127;
      child.emit('exit', 127, null);
    });

    await expect(
      client.connect({
        host: '10.75.166.249',
        username: 'Admin',
      }),
    ).rejects.toThrowError(
      /Failed to send connect request to RDP helper: write EPIPE[\s\S]*path=\/fake\/rdp-helper[\s\S]*pid=4242[\s\S]*exitCode=127, signal=null[\s\S]*libfreerdp2\.so/u,
    );
  });

  it('rejects old helper pending requests after a reconnect starts a new helper', async () => {
    const firstChild = new FakeChildProcess();
    const secondChild = new FakeChildProcess();
    const spawnedChildren = [firstChild, secondChild];
    let spawnCount = 0;

    const client = new HelperProcessRDPBackendClient({
      spawnFn: () => spawnedChildren[spawnCount++] as any,
      helperPath: '/fake/rdp-helper',
    });

    onNextRequest(firstChild, (request) => {
      expect(request.payload.type).toBe('connect');
      writeResponse(firstChild, {
        id: request.id,
        ok: true,
        payload: {
          type: 'connected',
          info: {
            sessionId: 'session-1',
            server: '10.75.166.249:3389',
            size: { width: 1280, height: 720 },
          },
        },
      });
    });

    await client.connect({
      host: '10.75.166.249',
      username: 'Admin',
    });

    const screenshotPromise = client.screenshotBase64();
    firstChild.stderr.write('first helper crashed before screenshot response');
    firstChild.exitCode = 1;
    firstChild.emit('exit', 1, null);

    onNextRequest(secondChild, (request) => {
      expect(request.payload.type).toBe('connect');
      writeResponse(secondChild, {
        id: request.id,
        ok: true,
        payload: {
          type: 'connected',
          info: {
            sessionId: 'session-2',
            server: '10.75.166.249:3389',
            size: { width: 1280, height: 720 },
          },
        },
      });
    });

    await expect(
      client.connect({
        host: '10.75.166.249',
        username: 'Admin',
      }),
    ).resolves.toEqual({
      sessionId: 'session-2',
      server: '10.75.166.249:3389',
      size: { width: 1280, height: 720 },
    });

    await expect(screenshotPromise).rejects.toThrowError(
      /RDP helper exited unexpectedly[\s\S]*first helper crashed before screenshot response/u,
    );
    expect(spawnCount).toBe(2);
  });

  it('throws on malformed helper output', async () => {
    const { child, client } = createClientWithChild();

    onNextRequest(child, () => {
      child.stdout.write('this is not json\n');
    });

    await expect(
      client.connect({
        host: '10.75.166.249',
      }),
    ).rejects.toThrow('RDP helper emitted malformed JSON');
  });

  it('surfaces the original helper exit instead of silently restarting an empty helper', async () => {
    const firstChild = new FakeChildProcess();
    const secondChild = new FakeChildProcess();
    const spawnedChildren = [firstChild, secondChild];
    let spawnCount = 0;

    const client = new HelperProcessRDPBackendClient({
      spawnFn: () => spawnedChildren[spawnCount++] as any,
      helperPath: '/fake/rdp-helper',
    });

    onNextRequest(firstChild, (request) => {
      expect(request.payload.type).toBe('connect');
      writeResponse(firstChild, {
        id: request.id,
        ok: true,
        payload: {
          type: 'connected',
          info: {
            sessionId: 'session-1',
            server: '10.75.166.249:3389',
            size: { width: 1280, height: 720 },
          },
        },
      });
    });

    await client.connect({
      host: '10.75.166.249',
      username: 'Admin',
    });

    firstChild.exitCode = 1;
    firstChild.emit('exit', 1, null);

    await expect(client.size()).rejects.toThrow(
      'RDP helper exited unexpectedly',
    );
    expect(spawnCount).toBe(1);
  });
});
