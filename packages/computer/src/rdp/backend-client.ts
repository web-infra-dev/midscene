import {
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
  spawn,
} from 'node:child_process';
import { once } from 'node:events';
import { type Interface, createInterface } from 'node:readline';
import type { Size } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { getRdpHelperBinaryPath } from './helper-binary';
import type {
  RDPBackendClient,
  RDPConnectionConfig,
  RDPConnectionInfo,
  RDPHelperRequest,
  RDPHelperResponse,
  RDPMouseButton,
  RDPMouseButtonAction,
  RDPProtocolRequest,
  RDPProtocolResponse,
  RDPScrollDirection,
} from './protocol';

const debug = getDebug('rdp:backend');
const HELPER_SHUTDOWN_TIMEOUT_MS = 3_000;
const MAX_STDERR_LINES = 40;

type PendingRequest = {
  resolve: (value: RDPProtocolResponse) => void;
  reject: (error: Error) => void;
};

type SpawnFn = (
  command: string,
  args?: readonly string[],
  options?: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

const notImplementedError = () =>
  new Error(
    'RDP backend transport is not implemented yet. Inject a custom backend into RDPDevice or implement a real helper transport.',
  );

export class UnsupportedRDPBackendClient implements RDPBackendClient {
  async connect(_config: RDPConnectionConfig): Promise<RDPConnectionInfo> {
    debug('connect called on unsupported backend');
    throw notImplementedError();
  }

  async disconnect(): Promise<void> {
    debug('disconnect called on unsupported backend');
    throw notImplementedError();
  }

  async screenshotBase64(): Promise<string> {
    debug('screenshotBase64 called on unsupported backend');
    throw notImplementedError();
  }

  async size(): Promise<Size> {
    debug('size called on unsupported backend');
    throw notImplementedError();
  }

  async mouseMove(_x: number, _y: number): Promise<void> {
    debug('mouseMove called on unsupported backend');
    throw notImplementedError();
  }

  async mouseButton(
    _button: RDPMouseButton,
    _action: RDPMouseButtonAction,
  ): Promise<void> {
    debug('mouseButton called on unsupported backend');
    throw notImplementedError();
  }

  async wheel(
    _direction: RDPScrollDirection,
    _amount: number,
    _x?: number,
    _y?: number,
  ): Promise<void> {
    debug('wheel called on unsupported backend');
    throw notImplementedError();
  }

  async keyPress(_keyName: string): Promise<void> {
    debug('keyPress called on unsupported backend');
    throw notImplementedError();
  }

  async typeText(_text: string): Promise<void> {
    debug('typeText called on unsupported backend');
    throw notImplementedError();
  }

  async clearInput(): Promise<void> {
    debug('clearInput called on unsupported backend');
    throw notImplementedError();
  }
}

export class HelperProcessRDPBackendClient implements RDPBackendClient {
  private readonly spawnFn: SpawnFn;
  private readonly resolveHelperPath: () => string;
  private child?: ChildProcessWithoutNullStreams;
  private stdoutReader?: Interface;
  private stderrReader?: Interface;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly stderrLines: string[] = [];
  private nextRequestId = 0;
  private connected = false;
  private fatalHelperError?: Error;

  constructor(options?: { spawnFn?: SpawnFn; helperPath?: string }) {
    this.spawnFn = options?.spawnFn || spawn;
    const overridePath = options?.helperPath;
    this.resolveHelperPath = overridePath
      ? () => overridePath
      : getRdpHelperBinaryPath;
  }

  async connect(config: RDPConnectionConfig): Promise<RDPConnectionInfo> {
    this.fatalHelperError = undefined;
    await this.ensureHelperStarted();
    const response = await this.send({
      type: 'connect',
      config,
    });

    if (response.type !== 'connected') {
      throw new Error(`Expected connected response, got ${response.type}`);
    }

    this.connected = true;
    this.fatalHelperError = undefined;
    return response.info;
  }

  async disconnect(): Promise<void> {
    const child = this.child;
    if (!child) {
      return;
    }

    let disconnectError: Error | undefined;
    if (this.connected && child.exitCode === null) {
      try {
        const response = await this.send({
          type: 'disconnect',
        });
        this.expectOk(response, 'disconnect');
      } catch (error) {
        disconnectError =
          error instanceof Error ? error : new Error(String(error));
      }
    }

    this.connected = false;
    this.fatalHelperError = undefined;
    await this.shutdownHelper();

    if (
      disconnectError &&
      !/RDP helper exited unexpectedly|RDP helper is not running|RDP helper shut down/u.test(
        disconnectError.message,
      )
    ) {
      throw disconnectError;
    }
  }

  async screenshotBase64(): Promise<string> {
    const response = await this.send({
      type: 'screenshot',
    });

    if (response.type !== 'screenshot') {
      throw new Error(`Expected screenshot response, got ${response.type}`);
    }

    return response.base64;
  }

  async size(): Promise<Size> {
    const response = await this.send({
      type: 'size',
    });

    if (response.type !== 'size') {
      throw new Error(`Expected size response, got ${response.type}`);
    }

    return response.size;
  }

  async mouseMove(x: number, y: number): Promise<void> {
    const response = await this.send({
      type: 'mouseMove',
      x,
      y,
    });
    this.expectOk(response, 'mouseMove');
  }

  async mouseButton(
    button: RDPMouseButton,
    action: RDPMouseButtonAction,
  ): Promise<void> {
    const response = await this.send({
      type: 'mouseButton',
      button,
      action,
    });
    this.expectOk(response, 'mouseButton');
  }

  async wheel(
    direction: RDPScrollDirection,
    amount: number,
    x?: number,
    y?: number,
  ): Promise<void> {
    const response = await this.send({
      type: 'wheel',
      direction,
      amount,
      x,
      y,
    });
    this.expectOk(response, 'wheel');
  }

  async keyPress(keyName: string): Promise<void> {
    const response = await this.send({
      type: 'keyPress',
      keyName,
    });
    this.expectOk(response, 'keyPress');
  }

  async typeText(text: string): Promise<void> {
    const response = await this.send({
      type: 'typeText',
      text,
    });
    this.expectOk(response, 'typeText');
  }

  async clearInput(): Promise<void> {
    const response = await this.send({
      type: 'clearInput',
    });
    this.expectOk(response, 'clearInput');
  }

  private async ensureHelperStarted(): Promise<void> {
    if (this.child && this.child.exitCode === null) {
      return;
    }

    const helperPath = this.resolveHelperPath();
    debug('starting rdp helper', { helperPath });
    const child = this.spawnFn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    this.child = child;
    this.stderrLines.length = 0;
    this.stdoutReader = createInterface({
      input: child.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    this.stderrReader = createInterface({
      input: child.stderr,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    this.stdoutReader.on('line', (line) => {
      this.handleStdoutLine(line);
    });
    this.stderrReader.on('line', (line) => {
      this.captureStderrLine(line);
    });

    child.on('exit', (code, signal) => {
      this.connected = false;
      const error = this.createHelperError(
        `RDP helper exited unexpectedly (code=${code}, signal=${signal})`,
      );
      this.fatalHelperError = error;
      this.rejectPending(error);
      this.disposeReaders();
      this.child = undefined;
    });

    child.on('error', (error) => {
      this.connected = false;
      const helperError = this.createHelperError(
        `Failed to start RDP helper: ${error.message}`,
      );
      this.fatalHelperError = helperError;
      this.rejectPending(helperError);
      this.disposeReaders();
      this.child = undefined;
    });
  }

  private handleStdoutLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let parsed: RDPHelperResponse;
    try {
      parsed = JSON.parse(line) as RDPHelperResponse;
    } catch (error) {
      const protocolError = this.createHelperError(
        `RDP helper emitted malformed JSON: ${line}`,
      );
      this.rejectPending(protocolError);
      void this.shutdownHelper(protocolError);
      return;
    }

    const pending = this.pending.get(parsed.id);
    if (!pending) {
      debug('dropping response for unknown request id', parsed);
      return;
    }

    this.pending.delete(parsed.id);
    if (parsed.ok) {
      pending.resolve(parsed.payload);
      return;
    }

    pending.reject(
      this.createHelperError(parsed.error.message, parsed.error.code),
    );
  }

  private captureStderrLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    this.stderrLines.push(line);
    if (this.stderrLines.length > MAX_STDERR_LINES) {
      this.stderrLines.shift();
    }
  }

  private async send(
    payload: RDPProtocolRequest,
  ): Promise<RDPProtocolResponse> {
    if (
      payload.type !== 'connect' &&
      this.fatalHelperError &&
      (!this.child || this.child.exitCode !== null)
    ) {
      throw this.fatalHelperError;
    }

    await this.ensureHelperStarted();

    const child = this.child;
    if (!child || child.exitCode !== null) {
      throw this.createHelperError('RDP helper is not running');
    }

    const id = `req-${++this.nextRequestId}`;
    const request: RDPHelperRequest = {
      id,
      payload,
    };

    return new Promise<RDPProtocolResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) {
          return;
        }

        this.pending.delete(id);
        reject(
          this.createHelperError(
            `Failed to send ${payload.type} request to RDP helper: ${error.message}`,
          ),
        );
      });
    });
  }

  private expectOk(
    response: RDPProtocolResponse,
    actionName: string,
  ): asserts response is { type: 'ok' } {
    if (response.type !== 'ok') {
      throw new Error(
        `Expected ok response for ${actionName}, got ${response.type}`,
      );
    }
  }

  private rejectPending(error: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(error);
    }
    this.pending.clear();
  }

  private createHelperError(message: string, code?: string): Error {
    const stderrSummary = this.stderrLines.join('\n').trim();
    const suffix = stderrSummary ? `\nHelper stderr:\n${stderrSummary}` : '';
    const error = new Error(`${message}${suffix}`);
    if (code) {
      error.name = code;
    }
    return error;
  }

  private disposeReaders(): void {
    this.stdoutReader?.close();
    this.stderrReader?.close();
    this.stdoutReader = undefined;
    this.stderrReader = undefined;
  }

  private async shutdownHelper(rootError?: Error): Promise<void> {
    const child = this.child;
    this.child = undefined;
    this.disposeReaders();

    if (!child) {
      return;
    }

    this.rejectPending(
      rootError || this.createHelperError('RDP helper shut down'),
    );

    if (child.exitCode !== null) {
      return;
    }

    child.stdin.end();

    const exited = Promise.race([
      once(child, 'exit'),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), HELPER_SHUTDOWN_TIMEOUT_MS);
      }),
    ]);

    const result = await exited;
    if (result !== 'timeout') {
      return;
    }

    child.kill('SIGTERM');
    const terminated = Promise.race([
      once(child, 'exit'),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), HELPER_SHUTDOWN_TIMEOUT_MS);
      }),
    ]);

    const terminateResult = await terminated;
    if (terminateResult !== 'timeout') {
      return;
    }

    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

export function createDefaultRDPBackendClient(): RDPBackendClient {
  return new HelperProcessRDPBackendClient();
}
