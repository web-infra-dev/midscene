import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import type { AgentOpt, IGroupedActionDump } from './types';
import { GroupedActionDump } from './types';

export interface PersistedSession {
  sessionId: string;
  platform: string;
  groupName: string;
  groupDescription?: string;
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
}

interface UpsertExecutionInput {
  sessionId: string;
  executionKey: string;
  groupedDump: GroupedActionDump;
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

function orderedExecutionFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((file) => /^\d{6}\.json$/.test(file))
    .sort((left, right) => left.localeCompare(right));
}

export const SessionStore = {
  rootDir(): string {
    return getMidsceneRunSubDir('session');
  },

  sessionDir(sessionId: string): string {
    return join(SessionStore.rootDir(), sessionId);
  },

  sessionFilePath(sessionId: string): string {
    return join(SessionStore.sessionDir(sessionId), 'session.json');
  },

  executionsDir(sessionId: string): string {
    const dir = join(SessionStore.sessionDir(sessionId), 'executions');
    mkdirSync(dir, { recursive: true });
    return dir;
  },

  reportDir(sessionId: string): string {
    const dir = join(SessionStore.sessionDir(sessionId), 'report');
    mkdirSync(dir, { recursive: true });
    return dir;
  },

  load(sessionId: string): PersistedSession {
    const filePath = SessionStore.sessionFilePath(sessionId);
    if (!existsSync(filePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return JSON.parse(readFileSync(filePath, 'utf-8')) as PersistedSession;
  },

  save(session: PersistedSession): PersistedSession {
    mkdirSync(SessionStore.sessionDir(session.sessionId), { recursive: true });
    writeFileSync(
      SessionStore.sessionFilePath(session.sessionId),
      JSON.stringify(session, null, 2),
      'utf-8',
    );
    return session;
  },

  ensureSession(input: EnsureSessionInput): PersistedSession {
    const now = Date.now();
    const filePath = SessionStore.sessionFilePath(input.sessionId);

    if (existsSync(filePath)) {
      const existing = SessionStore.load(input.sessionId);
      const next: PersistedSession = {
        ...existing,
        platform: existing.platform || input.platform,
        groupName:
          existing.groupName ||
          input.groupName ||
          defaultGroupName(input.platform, input.sessionId),
        groupDescription: existing.groupDescription ?? input.groupDescription,
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
    const basePath = join(
      SessionStore.executionsDir(input.sessionId),
      `${String(order).padStart(6, '0')}.json`,
    );

    GroupedActionDump.cleanupFiles(basePath);
    input.groupedDump.serializeToFiles(basePath);

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
    const executionFiles = orderedExecutionFiles(
      SessionStore.executionsDir(sessionId),
    );

    if (!executionFiles.length) {
      throw new Error(`Session ${sessionId} has no persisted executions`);
    }

    const modelBriefs = new Set<string>();
    const executions: IGroupedActionDump['executions'] = [];
    let sdkVersion = '';
    let deviceType = session.platform;

    for (const fileName of executionFiles) {
      const basePath = join(SessionStore.executionsDir(sessionId), fileName);
      const inlineJson = GroupedActionDump.fromFilesAsInlineJson(basePath);
      const shard = JSON.parse(inlineJson) as IGroupedActionDump;

      if (!sdkVersion && shard.sdkVersion) {
        sdkVersion = shard.sdkVersion;
      }
      if (shard.deviceType) {
        deviceType = shard.deviceType;
      }
      shard.modelBriefs.forEach((brief) => modelBriefs.add(brief));
      executions.push(...shard.executions);
    }

    return {
      sdkVersion,
      groupName: session.groupName,
      groupDescription: session.groupDescription,
      modelBriefs: [...modelBriefs],
      executions,
      deviceType,
    };
  },
};

export function createSessionAgentOptions(
  input: SessionAgentOptionsInput,
): Partial<AgentOpt> {
  if (!input.sessionId || !input.commandId) {
    return {};
  }

  SessionStore.ensureSession({
    sessionId: input.sessionId,
    platform: input.platform,
    groupName: input.groupName,
    groupDescription: input.groupDescription,
  });

  return {
    generateReport: false,
    groupName:
      input.groupName || defaultGroupName(input.platform, input.sessionId),
    groupDescription: input.groupDescription,
    onExecutionDumpUpdate: async (execution, metadata) => {
      const executionKey = `${input.commandId}:${metadata.executionIndex}`;
      const shardDump = new GroupedActionDump({
        sdkVersion: metadata.groupedDump.sdkVersion,
        groupName: metadata.groupedDump.groupName,
        groupDescription: metadata.groupedDump.groupDescription,
        modelBriefs: metadata.groupedDump.modelBriefs,
        executions: [execution],
        deviceType: metadata.groupedDump.deviceType,
      });

      const { order } = SessionStore.upsertExecution({
        sessionId: input.sessionId!,
        executionKey,
        groupedDump: shardDump,
      });

      SessionStore.saveExecutionOrder(input.sessionId!, executionKey, order);
    },
  };
}
