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
import type { AgentOpt, IExecutionDump, IGroupedActionDump } from './types';
import { ExecutionDump } from './types';

const sessionLockRetryDelayMs = 20;
const sessionLockTimeoutMs = 30_000;
const sessionLockStaleMs = 5 * 60_000;
const sessionLockSleepArray = new Int32Array(new SharedArrayBuffer(4));

export interface PersistedSession {
  sessionId: string;
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

interface EnsureSessionInput {
  sessionId: string;
  platform: string;
  groupName?: string;
  groupDescription?: string;
  sdkVersion?: string;
  modelBriefs?: string[];
  deviceType?: string;
}

function defaultGroupName(platform: string, sessionId: string): string {
  return `Midscene ${platform} session ${sessionId}`;
}

function normalizeSessionRecord(
  session: Partial<PersistedSession> & {
    sessionId: string;
    platform: string;
  },
): PersistedSession {
  return {
    sessionId: session.sessionId,
    platform: session.platform,
    groupName:
      session.groupName ??
      defaultGroupName(session.platform, session.sessionId),
    groupDescription: session.groupDescription,
    sdkVersion: session.sdkVersion ?? '',
    modelBriefs: session.modelBriefs ?? [],
    deviceType: session.deviceType ?? session.platform,
    createdAt: session.createdAt ?? Date.now(),
    updatedAt: session.updatedAt ?? Date.now(),
    executionCount: session.executionCount ?? 0,
    reportFilePath: session.reportFilePath,
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
  Atomics.wait(sessionLockSleepArray, 0, 0, ms);
}

function validateSessionId(sessionId: string): void {
  if (
    !sessionId ||
    /[/\\]/.test(sessionId) ||
    sessionId === '.' ||
    sessionId === '..'
  ) {
    throw new Error(`Invalid sessionId: ${sessionId}`);
  }
}

function sessionDirPath(sessionId: string): string {
  validateSessionId(sessionId);
  return join(getMidsceneRunSubDir('session'), sessionId);
}

function sessionLockDir(sessionId: string): string {
  return join(sessionDirPath(sessionId), '.lock');
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EEXIST'
  );
}

function withSessionLock<T>(sessionId: string, fn: () => T): T {
  const dir = sessionDirPath(sessionId);
  const lockDir = sessionLockDir(sessionId);
  const lockDeadline = Date.now() + sessionLockTimeoutMs;

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
        if (Date.now() - statSync(lockDir).mtimeMs > sessionLockStaleMs) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Ignore stale-lock cleanup races and retry.
      }

      if (Date.now() >= lockDeadline) {
        throw new Error(`Timed out waiting for session lock: ${sessionId}`);
      }

      sleepSync(sessionLockRetryDelayMs);
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

export const SessionStore = {
  rootDir(): string {
    return getMidsceneRunSubDir('session');
  },

  sessionDir(sessionId: string): string {
    return sessionDirPath(sessionId);
  },

  agentFilePath(sessionId: string): string {
    return join(SessionStore.sessionDir(sessionId), 'agent.json');
  },

  executionBasePath(sessionId: string, order: number): string {
    return join(SessionStore.sessionDir(sessionId), `${order}.json`);
  },

  reportDir(sessionId: string): string {
    const dir = join(SessionStore.sessionDir(sessionId), 'report');
    mkdirSync(dir, { recursive: true });
    return dir;
  },

  load(sessionId: string): PersistedSession {
    const filePath = SessionStore.agentFilePath(sessionId);

    if (!existsSync(filePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return normalizeSessionRecord(
      JSON.parse(readFileSync(filePath, 'utf-8')) as PersistedSession,
    );
  },

  save(session: PersistedSession): PersistedSession {
    mkdirSync(SessionStore.sessionDir(session.sessionId), { recursive: true });
    const normalized = normalizeSessionRecord(session);
    writeTextFileAtomic(
      SessionStore.agentFilePath(normalized.sessionId),
      JSON.stringify(normalized, null, 2),
    );
    return normalized;
  },

  ensureSession(input: EnsureSessionInput): PersistedSession {
    return withSessionLock(input.sessionId, () => {
      const now = Date.now();
      const filePath = SessionStore.agentFilePath(input.sessionId);

      if (existsSync(filePath)) {
        const existing = SessionStore.load(input.sessionId);
        const mergedModelBriefs = new Set(existing.modelBriefs);
        input.modelBriefs?.forEach((brief) => mergedModelBriefs.add(brief));
        const next: PersistedSession = {
          ...existing,
          platform: input.platform ?? existing.platform,
          groupName:
            input.groupName ??
            existing.groupName ??
            defaultGroupName(input.platform, input.sessionId),
          groupDescription: input.groupDescription ?? existing.groupDescription,
          sdkVersion: input.sdkVersion ?? existing.sdkVersion,
          modelBriefs: [...mergedModelBriefs],
          deviceType:
            input.deviceType ?? existing.deviceType ?? existing.platform,
          updatedAt: now,
        };
        return SessionStore.save(next);
      }

      return SessionStore.save({
        sessionId: input.sessionId,
        platform: input.platform,
        groupName:
          input.groupName ?? defaultGroupName(input.platform, input.sessionId),
        groupDescription: input.groupDescription,
        sdkVersion: input.sdkVersion ?? '',
        modelBriefs: input.modelBriefs ?? [],
        deviceType: input.deviceType ?? input.platform,
        createdAt: now,
        updatedAt: now,
        executionCount: 0,
      });
    });
  },

  markReportGenerated(
    sessionId: string,
    reportFilePath: string,
  ): PersistedSession {
    return withSessionLock(sessionId, () => {
      const session = SessionStore.load(sessionId);
      return SessionStore.save({
        ...session,
        reportFilePath,
        updatedAt: Date.now(),
      });
    });
  },

  appendExecution(sessionId: string, execution: ExecutionDump): number {
    return withSessionLock(sessionId, () => {
      const session = SessionStore.load(sessionId);
      const order = session.executionCount + 1;
      const basePath = SessionStore.executionBasePath(sessionId, order);

      ExecutionDump.cleanupFiles(basePath);
      execution.serializeToFiles(basePath);
      SessionStore.save({
        ...session,
        executionCount: order,
        updatedAt: Date.now(),
      });

      return order;
    });
  },

  updateExecution(
    sessionId: string,
    order: number,
    execution: ExecutionDump,
  ): void {
    withSessionLock(sessionId, () => {
      const session = SessionStore.load(sessionId);
      const basePath = SessionStore.executionBasePath(sessionId, order);

      ExecutionDump.cleanupFiles(basePath);
      execution.serializeToFiles(basePath);
      SessionStore.save({
        ...session,
        executionCount: Math.max(session.executionCount, order),
        updatedAt: Date.now(),
      });
    });
  },

  buildSessionDump(sessionId: string): IGroupedActionDump {
    return withSessionLock(sessionId, () => {
      const session = SessionStore.load(sessionId);
      const rootExecutionFiles = orderedRootExecutionFiles(
        SessionStore.sessionDir(sessionId),
      );

      if (!rootExecutionFiles.length) {
        throw new Error(`Session ${sessionId} has no persisted executions`);
      }

      const executions: IExecutionDump[] = [];
      for (const fileName of rootExecutionFiles) {
        const basePath = join(SessionStore.sessionDir(sessionId), fileName);
        const inlineJson = ExecutionDump.fromFilesAsInlineJson(basePath);
        executions.push(JSON.parse(inlineJson) as IExecutionDump);
      }

      return {
        sdkVersion: session.sdkVersion,
        groupName: session.groupName,
        groupDescription: session.groupDescription,
        modelBriefs: session.modelBriefs,
        executions,
        deviceType: session.deviceType ?? session.platform,
      };
    });
  },
};

export function createSessionAgentOptions(input: {
  sessionId?: string;
  platform: string;
  groupName?: string;
  groupDescription?: string;
}): Partial<AgentOpt> {
  if (!input.sessionId) {
    return {};
  }

  return {
    sessionId: input.sessionId,
    groupName:
      input.groupName ?? defaultGroupName(input.platform, input.sessionId),
    groupDescription: input.groupDescription,
  };
}
