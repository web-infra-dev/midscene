import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import type { AgentOpt, IExecutionDump, IGroupedActionDump } from './types';
import { ExecutionDump } from './types';

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
  status: 'active' | 'closed';
  executionCount: number;
  executionOrder: Record<string, number>;
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

interface UpsertExecutionInput {
  sessionId: string;
  executionKey: string;
  execution: ExecutionDump;
}

interface SessionAgentOptionsInput {
  sessionId?: string;
  platform: string;
  commandId?: string;
  commandName?: string;
  groupName?: string;
  groupDescription?: string;
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
      session.groupName ||
      defaultGroupName(session.platform, session.sessionId),
    groupDescription: session.groupDescription,
    sdkVersion: session.sdkVersion || '',
    modelBriefs: session.modelBriefs || [],
    deviceType: session.deviceType || session.platform,
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now(),
    status: session.status || 'active',
    executionCount: session.executionCount || 0,
    executionOrder: session.executionOrder || {},
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

export const SessionStore = {
  rootDir(): string {
    return getMidsceneRunSubDir('session');
  },

  sessionDir(sessionId: string): string {
    return join(SessionStore.rootDir(), sessionId);
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
    writeFileSync(
      SessionStore.agentFilePath(normalized.sessionId),
      JSON.stringify(normalized, null, 2),
      'utf-8',
    );
    return normalized;
  },

  ensureSession(input: EnsureSessionInput): PersistedSession {
    const now = Date.now();
    const filePath = SessionStore.agentFilePath(input.sessionId);

    if (existsSync(filePath)) {
      const existing = SessionStore.load(input.sessionId);
      const mergedModelBriefs = new Set(existing.modelBriefs);
      input.modelBriefs?.forEach((brief) => mergedModelBriefs.add(brief));
      const next: PersistedSession = {
        ...existing,
        platform: input.platform || existing.platform,
        groupName:
          input.groupName ||
          existing.groupName ||
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
        input.groupName || defaultGroupName(input.platform, input.sessionId),
      groupDescription: input.groupDescription,
      sdkVersion: input.sdkVersion || '',
      modelBriefs: input.modelBriefs || [],
      deviceType: input.deviceType || input.platform,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      executionCount: 0,
      executionOrder: {},
    });
  },

  markReportGenerated(
    sessionId: string,
    reportFilePath: string,
  ): PersistedSession {
    const session = SessionStore.load(sessionId);
    return SessionStore.save({
      ...session,
      reportFilePath,
      updatedAt: Date.now(),
    });
  },

  upsertExecution(input: UpsertExecutionInput): {
    order: number;
    basePath: string;
  } {
    const session = SessionStore.load(input.sessionId);
    const existingOrder = session.executionOrder[input.executionKey];
    const order = existingOrder ?? session.executionCount + 1;
    const basePath = SessionStore.executionBasePath(input.sessionId, order);

    ExecutionDump.cleanupFiles(basePath);
    input.execution.serializeToFiles(basePath);

    return {
      order,
      basePath,
    };
  },

  saveExecutionOrder(
    sessionId: string,
    executionKey: string,
    order: number,
  ): PersistedSession {
    const session = SessionStore.load(sessionId);
    return SessionStore.save({
      ...session,
      executionOrder: {
        ...session.executionOrder,
        [executionKey]: order,
      },
      executionCount: Math.max(session.executionCount, order),
      updatedAt: Date.now(),
    });
  },

  buildSessionDump(sessionId: string): IGroupedActionDump {
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
      deviceType: session.deviceType || session.platform,
    };
  },
};

export function createSessionAgentOptions(
  input: SessionAgentOptionsInput,
): Partial<AgentOpt> {
  if (!input.sessionId) {
    return {};
  }

  return {
    generateReport: false,
    sessionId: input.sessionId,
    commandId: input.commandId,
    commandName: input.commandName,
    groupName:
      input.groupName || defaultGroupName(input.platform, input.sessionId),
    groupDescription: input.groupDescription,
  };
}
