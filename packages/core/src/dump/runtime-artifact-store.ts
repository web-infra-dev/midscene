import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { uuid } from '@midscene/shared/utils';
import { ScreenshotItem } from '../screenshot-item';
import type { ExecutionDump, GroupedActionDump } from '../types';

export interface ScreenshotArtifactRef {
  kind: 'file';
  id: string;
  format: 'png' | 'jpeg';
  capturedAt: number;
}

export type SerializedDumpObject = Record<string, unknown>;

export type SerializedExecutionDumpObject = Record<string, unknown>;

export interface ExecutionUpdatedEvent {
  type: 'execution_updated';
  version: number;
  timestamp: number;
  requestId?: string;
  executionDump: SerializedExecutionDumpObject;
}

export interface ReportFlushedEvent {
  type: 'report_flushed';
  version: number;
  timestamp: number;
  requestId?: string;
  reportFile?: string | null;
}

export type AgentExecutionEvent = ExecutionUpdatedEvent | ReportFlushedEvent;

export interface AgentExecutionEventPayload {
  event: AgentExecutionEvent;
  getSnapshot: () => SerializedDumpObject;
  hydrateImage: (ref: ScreenshotArtifactRef) => Promise<string>;
}

type PersistedArtifact = {
  ref: ScreenshotArtifactRef;
  absolutePath: string;
};

function detectFormatFromExtension(pathValue: string): 'png' | 'jpeg' {
  return pathValue.endsWith('.jpeg') || pathValue.endsWith('.jpg')
    ? 'jpeg'
    : 'png';
}

export class RuntimeArtifactStore {
  private readonly rootDir: string;
  private readonly snapshotsDir: string;
  private readonly screenshotsDir: string;
  private readonly snapshotPath: string;
  private readonly eventsPath: string;
  private readonly artifacts = new Map<string, PersistedArtifact>();
  private latestSnapshot: SerializedDumpObject = {};

  constructor(label: string) {
    const safeLabel = label.replace(/[^\w.-]+/g, '-');
    this.rootDir = join(
      getMidsceneRunSubDir('tmp'),
      `runtime-dump-${safeLabel}-${uuid()}`,
    );
    this.snapshotsDir = join(this.rootDir, 'snapshots');
    this.screenshotsDir = join(this.rootDir, 'screenshots');
    this.snapshotPath = join(this.snapshotsDir, 'current.json');
    this.eventsPath = join(this.rootDir, 'events.ndjson');
  }

  private ensureDirs(): void {
    if (!existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
    if (!existsSync(this.snapshotsDir)) {
      mkdirSync(this.snapshotsDir, { recursive: true });
    }
    if (!existsSync(this.screenshotsDir)) {
      mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  persistScreenshot(screenshot: ScreenshotItem): ScreenshotArtifactRef {
    const cached = this.artifacts.get(screenshot.id);
    if (cached) {
      return cached.ref;
    }

    this.ensureDirs();

    const ext = screenshot.extension;
    const relativePath = `./screenshots/${screenshot.id}.${ext}`;
    const absolutePath = join(this.screenshotsDir, `${screenshot.id}.${ext}`);

    if (!existsSync(absolutePath)) {
      const buffer = Buffer.from(screenshot.rawBase64, 'base64');
      writeFileSync(absolutePath, buffer);
    }

    screenshot.markPersistedToPath(relativePath, absolutePath);

    const ref: ScreenshotArtifactRef = {
      kind: 'file',
      id: screenshot.id,
      format: screenshot.format,
      capturedAt: screenshot.capturedAt,
    };

    this.artifacts.set(screenshot.id, {
      ref,
      absolutePath,
    });

    return ref;
  }

  private serializeValue(value: unknown): unknown {
    if (value === undefined || typeof value === 'function') {
      return undefined;
    }

    if (value && (value as { constructor?: { name?: string } }).constructor) {
      const constructorName = (value as { constructor: { name?: string } })
        .constructor.name;
      if (constructorName === 'Page') {
        return '[Page object]';
      }
      if (constructorName === 'Browser') {
        return '[Browser object]';
      }
    }

    if (value instanceof ScreenshotItem) {
      return {
        $screenshot: this.persistScreenshot(value),
      };
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.serializeValue(item))
        .filter((item) => item !== undefined);
    }

    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const serialized = this.serializeValue(nestedValue);
        if (serialized !== undefined) {
          result[key] = serialized;
        }
      }
      return result;
    }

    return value;
  }

  writeSnapshot(dump: GroupedActionDump): SerializedDumpObject {
    this.ensureDirs();
    const snapshot = this.serializeValue(dump.toJSON()) as SerializedDumpObject;
    this.latestSnapshot = snapshot;
    writeFileSync(this.snapshotPath, JSON.stringify(snapshot), 'utf-8');
    return snapshot;
  }

  serializeExecutionDump(
    executionDump: ExecutionDump,
  ): SerializedExecutionDumpObject {
    this.ensureDirs();
    return this.serializeValue(
      executionDump.toJSON(),
    ) as SerializedExecutionDumpObject;
  }

  appendEvent(event: AgentExecutionEvent): void {
    this.ensureDirs();
    appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`);
  }

  getSnapshot(): SerializedDumpObject {
    if (Object.keys(this.latestSnapshot).length > 0) {
      return this.latestSnapshot;
    }

    if (!existsSync(this.snapshotPath)) {
      return {};
    }

    const content = readFileSync(this.snapshotPath, 'utf-8');
    this.latestSnapshot = JSON.parse(content) as SerializedDumpObject;
    return this.latestSnapshot;
  }

  async resolveImage(ref: ScreenshotArtifactRef): Promise<string> {
    const artifact = this.artifacts.get(ref.id);
    const absolutePath =
      artifact?.absolutePath ??
      join(this.screenshotsDir, `${ref.id}.${ref.format}`);

    const buffer = readFileSync(absolutePath);
    return `data:image/${ref.format};base64,${buffer.toString('base64')}`;
  }

  cleanup(): void {
    if (existsSync(this.rootDir)) {
      rmSync(this.rootDir, { force: true, recursive: true });
    }
    this.latestSnapshot = {};
    this.artifacts.clear();
  }
}

export function isScreenshotArtifactRef(
  value: unknown,
): value is ScreenshotArtifactRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === 'file' &&
    typeof candidate.id === 'string' &&
    (candidate.format === 'png' || candidate.format === 'jpeg') &&
    typeof candidate.capturedAt === 'number'
  );
}

export function screenshotArtifactRefFromPath(
  id: string,
  pathValue: string,
  capturedAt: number,
): ScreenshotArtifactRef {
  return {
    kind: 'file',
    id,
    format: detectFormatFromExtension(pathValue),
    capturedAt,
  };
}
