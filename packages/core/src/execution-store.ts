import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import type { IExecutionDump, IGroupedActionDump } from './types';
import { ExecutionDump } from './types';

const lockRetryDelayMs = 20;
const lockTimeoutMs = 30_000;
const lockStaleMs = 5 * 60_000;
const lockSleepArray = new Int32Array(new SharedArrayBuffer(4));

export interface ExecutionRecord {
  executionId: string;
  platform: string;
  groupName: string;
  groupDescription?: string;
  sdkVersion: string;
  modelBriefs: string[];
  deviceType?: string;
  createdAt: number;
  updatedAt: number;
  executionCount: number;
  reportFilePath?: string;
}

export interface EnsureExecutionRecordInput {
  executionId: string;
  platform: string;
  groupName?: string;
  groupDescription?: string;
  sdkVersion?: string;
  modelBriefs?: string[];
  deviceType?: string;
}

function defaultGroupName(platform: string, executionId: string): string {
  return `Midscene ${platform} execution ${executionId}`;
}

function normalizeExecutionRecord(
  record: Partial<ExecutionRecord> & {
    executionId: string;
    platform: string;
  },
): ExecutionRecord {
  return {
    executionId: record.executionId,
    platform: record.platform,
    groupName:
      record.groupName ?? defaultGroupName(record.platform, record.executionId),
    groupDescription: record.groupDescription,
    sdkVersion: record.sdkVersion ?? '',
    modelBriefs: record.modelBriefs ?? [],
    deviceType: record.deviceType ?? record.platform,
    createdAt: record.createdAt ?? Date.now(),
    updatedAt: record.updatedAt ?? Date.now(),
    executionCount: record.executionCount ?? 0,
    reportFilePath: record.reportFilePath,
  };
}

function orderedRootExecutionFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((file) => /^\d+\.json$/.test(file))
    .sort(
      (left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10),
    );
}

function sleepSync(ms: number): void {
  Atomics.wait(lockSleepArray, 0, 0, ms);
}

function validateExecutionId(executionId: string): void {
  if (
    !executionId ||
    /[/\\]/.test(executionId) ||
    executionId === '.' ||
    executionId === '..'
  ) {
    throw new Error(`Invalid executionId: ${executionId}`);
  }
}

function executionDirPath(executionId: string): string {
  validateExecutionId(executionId);
  return join(getMidsceneRunSubDir('execution'), executionId);
}

function executionLockDir(executionId: string): string {
  return join(executionDirPath(executionId), '.lock');
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EEXIST'
  );
}

function withLock<T>(executionId: string, fn: () => T): T {
  const dir = executionDirPath(executionId);
  const lockDir = executionLockDir(executionId);
  const lockDeadline = Date.now() + lockTimeoutMs;

  mkdirSync(dir, { recursive: true });

  while (true) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      try {
        if (Date.now() - statSync(lockDir).mtimeMs > lockStaleMs) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Ignore stale-lock cleanup races and retry.
      }

      if (Date.now() >= lockDeadline) {
        throw new Error(`Timed out waiting for execution lock: ${executionId}`);
      }

      sleepSync(lockRetryDelayMs);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

function writeTextFileAtomic(filePath: string, content: string): void {
  const tempFilePath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempFilePath, content, 'utf-8');
  renameSync(tempFilePath, filePath);
}

/**
 * Persists agent execution dumps to the filesystem, grouped by execution ID.
 * Each agent should own its own instance.
 */
export class ExecutionStore {
  rootDir(): string {
    return getMidsceneRunSubDir('execution');
  }

  executionDir(executionId: string): string {
    return executionDirPath(executionId);
  }

  agentFilePath(executionId: string): string {
    return join(this.executionDir(executionId), 'agent.json');
  }

  executionBasePath(executionId: string, order: number): string {
    return join(this.executionDir(executionId), `${order}.json`);
  }

  reportDir(executionId: string): string {
    const dir = join(this.executionDir(executionId), 'report');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  load(executionId: string): ExecutionRecord {
    const filePath = this.agentFilePath(executionId);

    if (!existsSync(filePath)) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    return normalizeExecutionRecord(
      JSON.parse(readFileSync(filePath, 'utf-8')) as ExecutionRecord,
    );
  }

  save(record: ExecutionRecord): ExecutionRecord {
    mkdirSync(this.executionDir(record.executionId), { recursive: true });
    const normalized = normalizeExecutionRecord(record);
    writeTextFileAtomic(
      this.agentFilePath(normalized.executionId),
      JSON.stringify(normalized, null, 2),
    );
    return normalized;
  }

  ensureExecution(input: EnsureExecutionRecordInput): ExecutionRecord {
    return withLock(input.executionId, () => {
      const now = Date.now();
      const filePath = this.agentFilePath(input.executionId);

      if (existsSync(filePath)) {
        const existing = this.load(input.executionId);
        const mergedModelBriefs = new Set(existing.modelBriefs);
        input.modelBriefs?.forEach((brief) => mergedModelBriefs.add(brief));
        const next: ExecutionRecord = {
          ...existing,
          platform: input.platform ?? existing.platform,
          groupName:
            input.groupName ??
            existing.groupName ??
            defaultGroupName(input.platform, input.executionId),
          groupDescription: input.groupDescription ?? existing.groupDescription,
          sdkVersion: input.sdkVersion ?? existing.sdkVersion,
          modelBriefs: [...mergedModelBriefs],
          deviceType:
            input.deviceType ?? existing.deviceType ?? existing.platform,
          updatedAt: now,
        };
        return this.save(next);
      }

      return this.save({
        executionId: input.executionId,
        platform: input.platform,
        groupName:
          input.groupName ??
          defaultGroupName(input.platform, input.executionId),
        groupDescription: input.groupDescription,
        sdkVersion: input.sdkVersion ?? '',
        modelBriefs: input.modelBriefs ?? [],
        deviceType: input.deviceType ?? input.platform,
        createdAt: now,
        updatedAt: now,
        executionCount: 0,
      });
    });
  }

  markReportGenerated(
    executionId: string,
    reportFilePath: string,
  ): ExecutionRecord {
    return withLock(executionId, () => {
      const record = this.load(executionId);
      return this.save({
        ...record,
        reportFilePath,
        updatedAt: Date.now(),
      });
    });
  }

  appendExecution(executionId: string, execution: ExecutionDump): number {
    return withLock(executionId, () => {
      const record = this.load(executionId);
      const order = record.executionCount + 1;
      const basePath = this.executionBasePath(executionId, order);

      ExecutionDump.cleanupFiles(basePath);
      execution.serializeToFiles(basePath);
      this.save({
        ...record,
        executionCount: order,
        updatedAt: Date.now(),
      });

      return order;
    });
  }

  updateExecution(
    executionId: string,
    order: number,
    execution: ExecutionDump,
  ): void {
    withLock(executionId, () => {
      const record = this.load(executionId);
      const basePath = this.executionBasePath(executionId, order);

      ExecutionDump.cleanupFiles(basePath);
      execution.serializeToFiles(basePath);
      this.save({
        ...record,
        executionCount: Math.max(record.executionCount, order),
        updatedAt: Date.now(),
      });
    });
  }

  buildGroupedDump(executionId: string): IGroupedActionDump {
    return withLock(executionId, () => {
      const record = this.load(executionId);
      const rootExecutionFiles = orderedRootExecutionFiles(
        this.executionDir(executionId),
      );

      if (!rootExecutionFiles.length) {
        throw new Error(`Execution ${executionId} has no persisted executions`);
      }

      const executions: IExecutionDump[] = [];
      for (const fileName of rootExecutionFiles) {
        const basePath = join(this.executionDir(executionId), fileName);
        const inlineJson = ExecutionDump.fromFilesAsInlineJson(basePath);
        executions.push(JSON.parse(inlineJson) as IExecutionDump);
      }

      return {
        sdkVersion: record.sdkVersion,
        groupName: record.groupName,
        groupDescription: record.groupDescription,
        modelBriefs: record.modelBriefs,
        executions,
        deviceType: record.deviceType ?? record.platform,
      };
    });
  }
}
