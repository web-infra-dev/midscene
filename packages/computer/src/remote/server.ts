import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { ActionScrollParam } from '@midscene/core';
import type { ComputerInputPrimitives } from '@midscene/core/device';
import { getDebug } from '@midscene/shared/logger';
import WebSocket, { WebSocketServer } from 'ws';
import { ComputerDevice } from '../device';
import {
  type BridgeDeviceOptions,
  type BridgeInput,
  COMPUTER_BRIDGE_PROTOCOL_VERSION,
  bridgeRequestSchema,
} from './protocol';

const debug = getDebug('computer:bridge');

export interface ComputerBridgeOptions {
  /** Bind loopback by default; callers provide a protected tunnel or TLS proxy. */
  host?: string;
  port?: number;
  /** Shared secret supplied by the resource owner; never included in URLs. */
  token: string;
  /** Optional resource-platform identifier. Defaults to a service-local ID. */
  targetId?: string;
}

export interface ComputerBridgeServer {
  readonly url: string;
  /** Disconnect clients and await their native Device cleanup. */
  close(): Promise<void>;
}

type BridgeDevice = Pick<
  ComputerDevice,
  'connect' | 'destroy' | 'size' | 'screenshotBase64'
> & {
  readonly inputPrimitives: ComputerInputPrimitives;
};

const hash = (value: string) => createHash('sha256').update(value).digest();

const invokeInput = async (device: BridgeDevice, input: BridgeInput) => {
  const { pointer, keyboard, scroll } = device.inputPrimitives;
  switch (input.action) {
    case 'tap':
      return pointer.tap(input.point, { duration: input.duration });
    case 'doubleClick':
      return pointer.doubleClick(input.point);
    case 'rightClick':
      return pointer.rightClick(input.point);
    case 'hover':
      return pointer.hover(input.point);
    case 'dragAndDrop':
      return pointer.dragAndDrop(input.from, input.to);
    case 'swipe': {
      if (!pointer.swipe) throw new Error('The target does not support Swipe.');
      return pointer.swipe(input.from, input.to, input.options);
    }
    case 'typeText':
      return keyboard.typeText(input.text, input.options);
    case 'keyboardPress':
      return keyboard.keyboardPress(input.key, { target: input.target });
    case 'clearInput':
      return keyboard.clearInput(input.target);
    case 'scroll':
      return scroll.scroll(input.param as ActionScrollParam);
  }
};

/** Internal dependency seam used by protocol integration tests. */
export async function createComputerBridgeServer(
  options: ComputerBridgeOptions,
  createDevice: (options: BridgeDeviceOptions) => BridgeDevice,
): Promise<ComputerBridgeServer> {
  if (typeof options.token !== 'string' || options.token.length < 16) {
    throw new Error(
      'Computer bridge token must contain at least 16 characters.',
    );
  }
  const port = options.port ?? 8766;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      'Computer bridge port must be an integer between 0 and 65535.',
    );
  }
  const targetOS =
    process.platform === 'darwin'
      ? 'macos'
      : process.platform === 'win32'
        ? 'windows'
        : process.platform === 'linux'
          ? 'linux'
          : undefined;
  if (!targetOS) throw new Error('Unsupported computer bridge target OS.');
  const secretHash = hash(options.token);
  const targetId = options.targetId ?? randomUUID();
  const server = new WebSocketServer({
    host: options.host ?? '127.0.0.1',
    port,
    maxPayload: 1_048_576,
    perMessageDeflate: false,
  });
  const cleanups = new Set<Promise<void>>();
  const disposeClients = new Map<WebSocket, () => Promise<void>>();
  // Detect lost controllers even when a session is idle; never replay inputs.
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const socket of server.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref();
  server.once('close', () => clearInterval(heartbeat));

  server.on('connection', (socket) => {
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    let authenticated = false;
    let closing = false;
    let device: BridgeDevice | undefined;
    let deviceCleanup: Promise<void> | undefined;
    let cleanup: Promise<void> | undefined;
    let queue = Promise.resolve();
    let lastRequestId = 0;
    let queuedRequests = 0;
    const destroyDevice = () => {
      deviceCleanup ??= Promise.resolve().then(() => device?.destroy());
      return deviceCleanup;
    };
    const dispose = () => {
      if (cleanup) return cleanup;
      closing = true;
      clearTimeout(authTimeout);
      cleanup = (async () => {
        // Destroy first to cancel native input delays, then drain queued work.
        const results = await Promise.allSettled([destroyDevice(), queue]);
        const errors = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        );
        if (errors.length)
          throw new AggregateError(errors, 'Native device cleanup failed.');
      })();
      cleanups.add(cleanup);
      void cleanup.then(
        () => cleanups.delete(cleanup!),
        (error) =>
          debug(
            'Device cleanup failed: %s',
            error instanceof Error ? error.message : 'unknown error',
          ),
      );
      return cleanup;
    };
    disposeClients.set(socket, dispose);
    const authTimeout = setTimeout(() => socket.terminate(), 10_000);
    authTimeout.unref();
    const send = (id: string, ok: boolean, result: unknown) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          version: COMPUTER_BRIDGE_PROTOCOL_VERSION,
          id,
          ok,
          ...(ok ? { result: result ?? null } : { error: result }),
        }),
      );
    };

    socket.on('message', (raw, binary) => {
      // Bound queued work as well as individual WebSocket frames.
      if (closing || queuedRequests >= 256) {
        socket.close(1008, 'Session is closing or overloaded');
        return;
      }
      let parsed: ReturnType<typeof bridgeRequestSchema.safeParse>;
      try {
        parsed = bridgeRequestSchema.safeParse(
          binary ? null : JSON.parse(raw.toString()),
        );
      } catch {
        socket.close(1008, 'Invalid bridge request');
        return;
      }
      if (!parsed.success) {
        socket.close(1008, 'Invalid bridge request');
        return;
      }
      const request = parsed.data;
      const requestId = Number(request.id);
      if (requestId <= lastRequestId) {
        socket.close(1008, 'Request IDs must increase');
        return;
      }
      lastRequestId = requestId;
      if (request.method === 'disconnect') {
        void dispose().then(
          () => {
            send(request.id, true, null);
            socket.close(1000, 'Disconnected');
          },
          () => {
            send(request.id, false, 'Native device cleanup failed.');
            socket.close(1011, 'Cleanup failed');
          },
        );
        return;
      }
      queuedRequests++;
      queue = queue.then(async () => {
        if (closing) return;
        try {
          if (request.method === 'hello') {
            if (
              authenticated ||
              !timingSafeEqual(secretHash, hash(request.params.token))
            ) {
              send(request.id, false, 'Computer bridge authentication failed.');
              socket.close(1008, 'Authentication failed');
              closing = true;
              return;
            }
            authenticated = true;
            clearTimeout(authTimeout);
            device = createDevice(request.params.options);
            await device.connect();
            if (closing) return;
            send(request.id, true, {
              protocolVersion: COMPUTER_BRIDGE_PROTOCOL_VERSION,
              sessionId: randomUUID(),
              targetId,
              targetOS,
              displayId: request.params.options.displayId,
              size: await device.size(),
            });
            return;
          }
          if (!authenticated || !device)
            throw new Error('Authenticate before using the computer bridge.');
          switch (request.method) {
            case 'screenshot':
              send(request.id, true, await device.screenshotBase64());
              break;
            case 'size':
              send(request.id, true, await device.size());
              break;
            case 'input':
              await invokeInput(device, request.params);
              send(request.id, true, null);
              break;
          }
        } catch (error) {
          send(
            request.id,
            false,
            error instanceof Error
              ? error.message
              : 'Computer operation failed.',
          );
          if (request.method === 'hello') {
            closing = true;
            socket.close(1011, 'Device initialization failed');
          }
        } finally {
          queuedRequests--;
        }
      });
    });
    socket.on('error', () => {
      socket.terminate();
    });
    socket.once('close', () => {
      disposeClients.delete(socket);
      void dispose().catch(() => {}); // Retained in cleanups and surfaced by server.close().
    });
  });
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const host = address.address.includes(':')
    ? `[${address.address}]`
    : address.address;
  let closePromise: Promise<void> | undefined;
  return {
    url: `ws://${host}:${address.port}`,
    close: () => {
      closePromise ??= (async () => {
        const closed = new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        const disposals = [...disposeClients].map(([socket, dispose]) => {
          socket.terminate();
          return dispose();
        });
        const results = await Promise.allSettled([...cleanups, ...disposals]);
        await closed;
        const errors = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        );
        if (errors.length)
          throw new AggregateError(errors, 'Computer bridge cleanup failed.');
      })();
      return closePromise;
    },
  };
}

/** Start only the desktop Device transport. No Agent, model or test Runner is created. */
export const startComputerBridge = (
  options: ComputerBridgeOptions,
): Promise<ComputerBridgeServer> =>
  createComputerBridgeServer(
    options,
    (deviceOptions) =>
      new ComputerDevice({ ...deviceOptions, headless: false }),
  );
