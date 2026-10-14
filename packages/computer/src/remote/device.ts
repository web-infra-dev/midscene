import type { DeviceAction, Size } from '@midscene/core';
import {
  type AbstractInterface,
  type ComputerInputPrimitives,
  defineActionsFromInputPrimitives,
} from '@midscene/core/device';
import WebSocket from 'ws';
import type { ComputerDeviceOpt } from '../device';
import {
  type BridgeInput,
  type BridgeRequest,
  COMPUTER_BRIDGE_PROTOCOL_VERSION,
  type ComputerBridgeConnectionInfo,
  bridgeConnectionInfoSchema,
  bridgeDeviceOptionsSchema,
  bridgeInputSchema,
  bridgeResponseSchema,
  bridgeSizeSchema,
} from './protocol';

export interface RemoteComputerDeviceOpt
  extends Pick<
    ComputerDeviceOpt,
    | 'displayId'
    | 'keyboardDriver'
    | 'keyboardLayout'
    | 'keyboardModifierDelay'
    | 'keyboardTypeDelay'
    | 'inputStrategy'
    | 'customActions'
  > {
  url: string;
  token: string;
  timeoutMs?: number;
  expectedOS?: ComputerBridgeConnectionInfo['targetOS'];
}

type Pending = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

/** A Device client only: models and ComputerAgent stay on the Runner host. */
export class RemoteComputerDevice implements AbstractInterface {
  readonly interfaceType = 'computer';
  uri?: string;
  #options: RemoteComputerDeviceOpt;
  #socket?: WebSocket;
  #pending = new Map<string, Pending>();
  #nextId = 0;
  #closed = false;
  #destroying = false;
  #connectPromise?: Promise<void>;
  #destroyPromise?: Promise<void>;
  #info?: ComputerBridgeConnectionInfo;

  readonly inputPrimitives: ComputerInputPrimitives = {
    pointer: {
      tap: (point, options) =>
        this.#input({ action: 'tap', point, duration: options?.duration }),
      doubleClick: (point) => this.#input({ action: 'doubleClick', point }),
      rightClick: (point) => this.#input({ action: 'rightClick', point }),
      hover: (point) => this.#input({ action: 'hover', point }),
      dragAndDrop: (from, to) =>
        this.#input({ action: 'dragAndDrop', from, to }),
      swipe: (from, to, options) =>
        this.#input({ action: 'swipe', from, to, options }),
    },
    keyboard: {
      typeText: (text, options) =>
        this.#input({ action: 'typeText', text, options } as BridgeInput),
      keyboardPress: (key, options) =>
        this.#input({
          action: 'keyboardPress',
          key,
          target: options?.target,
        } as BridgeInput),
      clearInput: (target) =>
        this.#input({ action: 'clearInput', target } as BridgeInput),
    },
    scroll: {
      scroll: (param) =>
        this.#input({ action: 'scroll', param } as BridgeInput),
    },
  };

  constructor(options: RemoteComputerDeviceOpt) {
    const url = new URL(options.url);
    if (
      !['ws:', 'wss:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error(
        'Computer bridge URL must be ws:// or wss:// without embedded credentials or fragment.',
      );
    }
    if (typeof options.token !== 'string' || options.token.length < 16) {
      throw new Error(
        'Computer bridge token must contain at least 16 characters.',
      );
    }
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
    ) {
      throw new Error('Computer bridge timeoutMs must be positive and finite.');
    }
    this.#options = { ...options, url: url.toString() };
  }

  get connectionInfo(): ComputerBridgeConnectionInfo | undefined {
    return this.#info;
  }

  connect(): Promise<void> {
    if (this.#closed || this.#destroying)
      return Promise.reject(
        new Error('Remote computer Device has been destroyed.'),
      );
    this.#connectPromise ??= this.#open();
    return this.#connectPromise;
  }

  async #open(): Promise<void> {
    const socket = new WebSocket(this.#options.url, {
      handshakeTimeout: this.#options.timeoutMs ?? 30_000,
      maxPayload: 64 * 1024 * 1024,
      perMessageDeflate: false,
    });
    this.#socket = socket;
    socket.on('message', (raw, binary) => {
      try {
        const response = bridgeResponseSchema.parse(
          binary ? null : JSON.parse(raw.toString()),
        );
        const pending = this.#pending.get(response.id);
        if (!pending) throw new Error('Unexpected computer bridge response.');
        clearTimeout(pending.timer);
        this.#pending.delete(response.id);
        if (response.ok) pending.resolve(response.result);
        else pending.reject(new Error(response.error));
      } catch {
        this.#fail(new Error('Invalid computer bridge response.'));
      }
    });
    socket.on('error', () =>
      this.#fail(new Error('Computer bridge transport failed.')),
    );
    socket.on('close', () =>
      this.#fail(new Error('Computer bridge connection closed.')),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', () =>
          reject(new Error('Cannot connect to computer bridge.')),
        );
        socket.once('close', () =>
          reject(new Error('Computer bridge closed during connection.')),
        );
      });
      const {
        displayId,
        keyboardDriver,
        keyboardLayout,
        keyboardModifierDelay,
        keyboardTypeDelay,
        inputStrategy,
      } = this.#options;
      const options = bridgeDeviceOptionsSchema.parse({
        displayId,
        keyboardDriver,
        keyboardLayout,
        keyboardModifierDelay,
        keyboardTypeDelay,
        inputStrategy,
      });
      const info = bridgeConnectionInfoSchema.parse(
        await this.#request('hello', { token: this.#options.token, options }),
      );
      this.#info = info;
      this.uri = `computer-bridge:${info.targetId}/${info.sessionId}`;
      if (
        this.#options.expectedOS &&
        this.#options.expectedOS !== info.targetOS
      ) {
        await this.destroy();
        throw new Error(
          `Expected ${this.#options.expectedOS} target, received ${info.targetOS}.`,
        );
      }
    } catch (error) {
      this.#fail(
        error instanceof Error
          ? error
          : new Error('Computer bridge initialization failed.'),
      );
      throw error;
    }
  }

  #fail(error: Error): void {
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    if (this.#socket && this.#socket.readyState !== WebSocket.CLOSED)
      this.#socket.terminate();
  }

  #request(method: BridgeRequest['method'], params: unknown): Promise<unknown> {
    if (this.#closed || this.#socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Computer bridge is not connected.'));
    }
    const id = String(++this.#nextId);
    const payload = JSON.stringify({
      version: COMPUTER_BRIDGE_PROTOCOL_VERSION,
      id,
      method,
      params,
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#fail(
          new Error(
            `Computer bridge ${method} timed out; operation was not replayed.`,
          ),
        );
      }, this.#options.timeoutMs ?? 30_000);
      this.#pending.set(id, { resolve, reject, timer });
      this.#socket!.send(payload, (error) => {
        if (error) this.#fail(new Error('Computer bridge send failed.'));
      });
    });
  }

  #assertReady(): void {
    if (!this.#info || this.#closed || this.#destroying)
      throw new Error('Remote computer Device is not connected.');
  }
  async #input(command: BridgeInput): Promise<void> {
    this.#assertReady();
    await this.#request('input', bridgeInputSchema.parse(command));
  }
  async screenshotBase64(): Promise<string> {
    this.#assertReady();
    const image = await this.#request('screenshot', {});
    if (typeof image !== 'string' || !image)
      throw new Error('Computer bridge returned an invalid screenshot.');
    return image;
  }
  async size(): Promise<Size> {
    this.#assertReady();
    return bridgeSizeSchema.parse(await this.#request('size', {}));
  }
  describe(): string {
    return this.#info
      ? `Type: Computer (remote)\nPlatform: ${this.#info.targetOS}\nSession: ${this.#info.sessionId}\nDisplay: ${this.#info.displayId ?? 'Primary'}`
      : 'Remote computer (disconnected)';
  }
  actionSpace(): DeviceAction[] {
    return [
      ...defineActionsFromInputPrimitives(this.inputPrimitives, {
        size: () => this.size(),
      }),
      ...(this.#options.customActions ?? []),
    ];
  }
  destroy(): Promise<void> {
    this.#destroying = true;
    this.#destroyPromise ??= (async () => {
      try {
        if (
          !this.#closed &&
          this.#info &&
          this.#socket?.readyState === WebSocket.OPEN
        )
          await this.#request('disconnect', {});
      } finally {
        this.#fail(new Error('Remote computer Device destroyed.'));
      }
    })();
    return this.#destroyPromise;
  }
}
