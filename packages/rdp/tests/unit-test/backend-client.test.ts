import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { HelperProcessRDPBackendClient } from '@/backend-client';
import type { RDPHelperRequest, RDPHelperResponse } from '@/protocol';

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  exitCode: number | null = null;
  killed = false;

  constructor() {
    super();
    this.stdin.setDefaultEncoding('utf8');
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
