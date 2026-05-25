import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import {
  type Interface as ReadlineInterface,
  createInterface,
} from 'node:readline';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { getDebug } from '@midscene/shared/logger';

const debugRecorder = getDebug('computer:recorder', { console: true });

export type ComputerNativeRecordedEventType = 'click' | 'scroll' | 'keydown';

export interface ComputerNativeRecordedEvent {
  type: ComputerNativeRecordedEventType;
  source: 'computer-native';
  actionType: 'Click' | 'Scroll' | 'KeyboardPress';
  rawPayload: Record<string, unknown>;
  value?: string;
  elementRect?: {
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
  pageInfo: {
    width: number;
    height: number;
  };
  screenshotBefore?: string;
  screenshotAfter?: string;
  elementDescription?: string;
  descriptionLoading?: boolean;
  timestamp: number;
  hashId: string;
}

export interface ComputerNativeRecorderStartResult {
  ok: boolean;
  supported: boolean;
  source: 'computer-native' | 'unsupported';
  platformId: 'computer';
  error?: string;
}

export interface ComputerNativeRecorderEventsResult {
  events: ComputerNativeRecordedEvent[];
  nextIndex: number;
}

export interface ComputerNativeRecorderOptions {
  displayId?: string;
  displayName?: string;
  screenshot?: () => Promise<string | undefined>;
}

interface RawNativeEvent {
  type?: ComputerNativeRecordedEventType;
  x?: number;
  y?: number;
  displayWidth?: number;
  displayHeight?: number;
  timestamp?: number;
  hashId?: string;
  deltaX?: number;
  deltaY?: number;
  keyCode?: number;
  flags?: number;
  [key: string]: unknown;
}

let eventRecorderBinaryPath: string | null | undefined;

interface SuppressedPreviewEvent {
  type: ComputerNativeRecordedEventType;
  x?: number;
  y?: number;
  expiresAt: number;
}

export function getComputerEventRecorderBinary(): string | null {
  if (eventRecorderBinaryPath !== undefined) return eventRecorderBinaryPath;
  if (process.platform !== 'darwin') {
    eventRecorderBinaryPath = null;
    return null;
  }

  const require = createRequire(import.meta.url);
  let pkgRoot: string | null = null;
  try {
    pkgRoot = dirname(require.resolve('@midscene/computer/package.json'));
  } catch {
    const hereDir = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [
      resolve(hereDir, '..'),
      resolve(hereDir, '../..'),
    ]) {
      if (existsSync(resolve(candidate, 'package.json'))) {
        pkgRoot = candidate;
        break;
      }
    }
  }

  if (!pkgRoot) {
    eventRecorderBinaryPath = null;
    return null;
  }

  const binPath = resolve(pkgRoot, 'bin/darwin/event-recorder');
  eventRecorderBinaryPath = existsSync(binPath) ? binPath : null;
  return eventRecorderBinaryPath;
}

function isSupportedRawEvent(event: RawNativeEvent): event is RawNativeEvent & {
  type: ComputerNativeRecordedEventType;
} {
  return (
    event.type === 'click' ||
    event.type === 'scroll' ||
    event.type === 'keydown'
  );
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function recorderActionType(
  type: ComputerNativeRecordedEventType,
): ComputerNativeRecordedEvent['actionType'] {
  switch (type) {
    case 'click':
      return 'Click';
    case 'scroll':
      return 'Scroll';
    case 'keydown':
      return 'KeyboardPress';
  }
}

function mergeScrollEvents(left: RawNativeEvent, right: RawNativeEvent) {
  return {
    ...right,
    deltaX:
      (numberOrUndefined(left.deltaX) || 0) +
      (numberOrUndefined(right.deltaX) || 0),
    deltaY:
      (numberOrUndefined(left.deltaY) || 0) +
      (numberOrUndefined(right.deltaY) || 0),
  };
}

function normalizeRawEvent(
  raw: RawNativeEvent & { type: ComputerNativeRecordedEventType },
  screenshotBefore?: string,
  screenshotAfter?: string,
): ComputerNativeRecordedEvent {
  const x = numberOrUndefined(raw.x);
  const y = numberOrUndefined(raw.y);
  const width = numberOrUndefined(raw.displayWidth) || 0;
  const height = numberOrUndefined(raw.displayHeight) || 0;
  const actionType = recorderActionType(raw.type);
  const timestamp = numberOrUndefined(raw.timestamp) || Date.now();
  const value =
    raw.type === 'scroll'
      ? `${numberOrUndefined(raw.deltaX) || 0},${numberOrUndefined(raw.deltaY) || 0}`
      : raw.type === 'keydown'
        ? `keyCode:${numberOrUndefined(raw.keyCode) ?? 'unknown'}`
        : x !== undefined && y !== undefined
          ? `${Math.round(x)},${Math.round(y)}`
          : undefined;

  return {
    type: raw.type,
    source: 'computer-native',
    actionType,
    rawPayload: raw,
    value,
    elementRect:
      x !== undefined && y !== undefined
        ? {
            x,
            y,
            left: x,
            top: y,
          }
        : undefined,
    pageInfo: {
      width,
      height,
    },
    screenshotBefore,
    screenshotAfter,
    elementDescription:
      raw.type === 'click' && x !== undefined && y !== undefined
        ? `(${Math.round(x)}, ${Math.round(y)})`
        : undefined,
    descriptionLoading: false,
    timestamp,
    hashId:
      typeof raw.hashId === 'string'
        ? raw.hashId
        : `computer-${raw.type}-${timestamp}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
  };
}

export class ComputerNativeEventRecorder {
  private readonly options: ComputerNativeRecorderOptions;
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private readline: ReadlineInterface | null = null;
  private events: ComputerNativeRecordedEvent[] = [];
  private lastScreenshot: string | undefined;
  private pendingScroll: RawNativeEvent | null = null;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private processing: Promise<void> = Promise.resolve();
  private lastError: string | undefined;
  private suppressedPreviewEvents: SuppressedPreviewEvent[] = [];

  constructor(options: ComputerNativeRecorderOptions = {}) {
    this.options = options;
  }

  getCapabilities(): ComputerNativeRecorderStartResult {
    if (process.platform !== 'darwin') {
      return {
        ok: false,
        supported: false,
        source: 'unsupported',
        platformId: 'computer',
        error: `Computer native recorder is only available on macOS for now. Current platform: ${process.platform}.`,
      };
    }

    if (!getComputerEventRecorderBinary()) {
      return {
        ok: false,
        supported: false,
        source: 'unsupported',
        platformId: 'computer',
        error:
          'Computer native recorder helper is missing. Run @midscene/computer build:native and restart Studio.',
      };
    }

    return {
      ok: true,
      supported: true,
      source: 'computer-native',
      platformId: 'computer',
    };
  }

  async start(): Promise<ComputerNativeRecorderStartResult> {
    await this.stop();
    this.events = [];
    this.pendingScroll = null;
    this.lastError = undefined;
    this.suppressedPreviewEvents = [];

    const capabilities = this.getCapabilities();
    if (!capabilities.supported) {
      return capabilities;
    }

    this.lastScreenshot = await this.takeScreenshot();
    const bin = getComputerEventRecorderBinary();
    if (!bin) {
      return {
        ok: false,
        supported: false,
        source: 'unsupported',
        platformId: 'computer',
        error: 'Computer native recorder helper is missing.',
      };
    }

    const args = this.options.displayId ? [String(this.options.displayId)] : [];
    const stderrChunks: string[] = [];

    try {
      this.child = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      return {
        ok: false,
        supported: false,
        source: 'unsupported',
        platformId: 'computer',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const child = this.child;
    this.readline = createInterface({ input: child.stdout });
    this.readline.on('line', (line) => {
      this.processing = this.processing
        .then(() => this.handleLine(line))
        .catch((error) => {
          debugRecorder('failed to process native recorder event:', error);
        });
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
    });
    child.once('exit', (code, signal) => {
      if (this.child === child) {
        this.child = null;
      }
      this.lastError =
        code === 0
          ? undefined
          : stderrChunks.join('').trim() ||
            `Computer native recorder exited with code ${code ?? 'null'}${signal ? ` and signal ${signal}` : ''}.`;
      if (this.lastError) {
        debugRecorder(this.lastError);
      }
    });

    return await new Promise<ComputerNativeRecorderStartResult>((resolve) => {
      let settled = false;
      const settle = (result: ComputerNativeRecorderStartResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.once('error', (error) => {
        settle({
          ok: false,
          supported: false,
          source: 'unsupported',
          platformId: 'computer',
          error: error.message,
        });
      });
      child.once('exit', (code, signal) => {
        settle({
          ok: false,
          supported: false,
          source: 'unsupported',
          platformId: 'computer',
          error:
            stderrChunks.join('').trim() ||
            `Computer native recorder exited with code ${code ?? 'null'}${signal ? ` and signal ${signal}` : ''}.`,
        });
      });
      child.once('spawn', () => {
        setTimeout(() => {
          settle({
            ok: true,
            supported: true,
            source: 'computer-native',
            platformId: 'computer',
          });
        }, 120);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
    await this.processing;
    await this.flushPendingScroll();

    const child = this.child;
    this.child = null;
    this.readline?.close();
    this.readline = null;

    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }

  async getEvents(since = 0): Promise<ComputerNativeRecorderEventsResult> {
    await this.processing;
    const startIndex = Number.isFinite(since) && since > 0 ? since : 0;
    return {
      events: this.events.slice(startIndex),
      nextIndex: this.events.length,
    };
  }

  getLastError(): string | undefined {
    return this.lastError;
  }

  suppressPreviewInteract(payload: Record<string, unknown>): void {
    const actionType =
      typeof payload.actionType === 'string' ? payload.actionType : undefined;
    if (!actionType) return;

    const type = ((): ComputerNativeRecordedEventType | null => {
      switch (actionType) {
        case 'Tap':
        case 'DoubleClick':
        case 'LongPress':
        case 'RightClick':
          return 'click';
        case 'DragAndDrop':
        case 'Swipe':
          return 'click';
        case 'Scroll':
          return 'scroll';
        case 'KeyboardPress':
        case 'Input':
          return 'keydown';
        default:
          return null;
      }
    })();
    if (!type) return;
    const suppressX =
      actionType === 'DragAndDrop' || actionType === 'Swipe'
        ? numberOrUndefined(payload.endX)
        : numberOrUndefined(payload.x);
    const suppressY =
      actionType === 'DragAndDrop' || actionType === 'Swipe'
        ? numberOrUndefined(payload.endY)
        : numberOrUndefined(payload.y);

    this.suppressedPreviewEvents.push({
      type,
      x: suppressX,
      y: suppressY,
      expiresAt: Date.now() + 1200,
    });
  }

  private async handleLine(line: string): Promise<void> {
    let parsed: RawNativeEvent;
    try {
      parsed = JSON.parse(line) as RawNativeEvent;
    } catch (error) {
      debugRecorder('ignoring malformed native recorder line:', line, error);
      return;
    }

    if (!isSupportedRawEvent(parsed)) {
      return;
    }

    if (this.shouldSuppressNativeEvent(parsed)) {
      return;
    }

    if (parsed.type === 'scroll') {
      this.pendingScroll = this.pendingScroll
        ? mergeScrollEvents(this.pendingScroll, parsed)
        : parsed;
      if (this.scrollTimer) {
        clearTimeout(this.scrollTimer);
      }
      this.scrollTimer = setTimeout(() => {
        this.scrollTimer = null;
        this.processing = this.processing
          .then(() => this.flushPendingScroll())
          .catch((error) => {
            debugRecorder('failed to flush native scroll event:', error);
          });
      }, 200);
      return;
    }

    await this.flushPendingScroll();
    await this.storeRawEvent(parsed);
  }

  private shouldSuppressNativeEvent(
    raw: RawNativeEvent & { type: ComputerNativeRecordedEventType },
  ): boolean {
    const now = Date.now();
    this.suppressedPreviewEvents = this.suppressedPreviewEvents.filter(
      (event) => event.expiresAt > now,
    );
    const rawX = numberOrUndefined(raw.x);
    const rawY = numberOrUndefined(raw.y);
    const index = this.suppressedPreviewEvents.findIndex((event) => {
      if (event.type !== raw.type) return false;
      if (
        event.x === undefined ||
        event.y === undefined ||
        rawX === undefined ||
        rawY === undefined
      ) {
        return true;
      }
      return Math.abs(event.x - rawX) <= 6 && Math.abs(event.y - rawY) <= 6;
    });
    if (index === -1) {
      return false;
    }
    this.suppressedPreviewEvents.splice(index, 1);
    return true;
  }

  private async flushPendingScroll(): Promise<void> {
    const pending = this.pendingScroll;
    this.pendingScroll = null;
    if (!pending || pending.type !== 'scroll') {
      return;
    }
    await this.storeRawEvent(pending as RawNativeEvent & { type: 'scroll' });
  }

  private async storeRawEvent(
    raw: RawNativeEvent & { type: ComputerNativeRecordedEventType },
  ): Promise<void> {
    const screenshotBefore = this.lastScreenshot;
    const screenshotAfter = await this.takeScreenshot();
    this.events.push(normalizeRawEvent(raw, screenshotBefore, screenshotAfter));
    this.lastScreenshot = screenshotAfter;
  }

  private async takeScreenshot(): Promise<string | undefined> {
    if (!this.options.screenshot) {
      return undefined;
    }
    try {
      return await this.options.screenshot();
    } catch (error) {
      debugRecorder('native recorder screenshot failed:', error);
      return undefined;
    }
  }
}
