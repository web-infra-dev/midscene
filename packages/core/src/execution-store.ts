import {
  appendFileSync,
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
import { escapeScriptTag } from '@midscene/shared/utils';
import { generateImageScriptTag } from './dump/html-utils';
import type { AgentOpt, IExecutionDump, IGroupedActionDump } from './types';
import { ExecutionDump } from './types';

const lockRetryDelayMs = 20;
const lockTimeoutMs = 30_000;
const lockStaleMs = 5 * 60_000;
const lockSleepArray = new Int32Array(new SharedArrayBuffer(4));

export interface ExecutionSession {
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

export interface EnsureExecutionSessionInput {
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
  session: Partial<ExecutionSession> & {
    sessionId: string;
    platform: string;
  },
): ExecutionSession {
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
  Atomics.wait(lockSleepArray, 0, 0, ms);
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

function withLock<T>(sessionId: string, fn: () => T): T {
  const dir = sessionDirPath(sessionId);
  const lockDir = sessionLockDir(sessionId);
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
        throw new Error(`Timed out waiting for session lock: ${sessionId}`);
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
 * Persists agent execution dumps to the filesystem, grouped by session ID.
 * Each agent should own its own instance.
 */
export class ExecutionStore {
  rootDir(): string {
    return getMidsceneRunSubDir('session');
  }

  sessionDir(sessionId: string): string {
    return sessionDirPath(sessionId);
  }

  agentFilePath(sessionId: string): string {
    return join(this.sessionDir(sessionId), 'agent.json');
  }

  executionBasePath(sessionId: string, order: number): string {
    return join(this.sessionDir(sessionId), `${order}.json`);
  }

  reportDir(sessionId: string): string {
    const dir = join(this.sessionDir(sessionId), 'report');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  load(sessionId: string): ExecutionSession {
    const filePath = this.agentFilePath(sessionId);

    if (!existsSync(filePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return normalizeSessionRecord(
      JSON.parse(readFileSync(filePath, 'utf-8')) as ExecutionSession,
    );
  }

  save(session: ExecutionSession): ExecutionSession {
    mkdirSync(this.sessionDir(session.sessionId), { recursive: true });
    const normalized = normalizeSessionRecord(session);
    writeTextFileAtomic(
      this.agentFilePath(normalized.sessionId),
      JSON.stringify(normalized, null, 2),
    );
    return normalized;
  }

  ensureSession(input: EnsureExecutionSessionInput): ExecutionSession {
    return withLock(input.sessionId, () => {
      const now = Date.now();
      const filePath = this.agentFilePath(input.sessionId);

      if (existsSync(filePath)) {
        const existing = this.load(input.sessionId);
        const mergedModelBriefs = new Set(existing.modelBriefs);
        input.modelBriefs?.forEach((brief) => mergedModelBriefs.add(brief));
        const next: ExecutionSession = {
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
        return this.save(next);
      }

      return this.save({
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
  }

  markReportGenerated(
    sessionId: string,
    reportFilePath: string,
  ): ExecutionSession {
    return withLock(sessionId, () => {
      const session = this.load(sessionId);
      return this.save({
        ...session,
        reportFilePath,
        updatedAt: Date.now(),
      });
    });
  }

  appendExecution(sessionId: string, execution: ExecutionDump): number {
    return withLock(sessionId, () => {
      const session = this.load(sessionId);
      const order = session.executionCount + 1;
      const basePath = this.executionBasePath(sessionId, order);

      ExecutionDump.cleanupMetadata(basePath);
      execution.serializeToFiles(basePath);
      this.save({
        ...session,
        executionCount: order,
        updatedAt: Date.now(),
      });

      return order;
    });
  }

  updateExecution(
    sessionId: string,
    order: number,
    execution: ExecutionDump,
  ): void {
    withLock(sessionId, () => {
      const session = this.load(sessionId);
      const basePath = this.executionBasePath(sessionId, order);

      ExecutionDump.cleanupMetadata(basePath);
      execution.serializeToFiles(basePath);
      this.save({
        ...session,
        executionCount: Math.max(session.executionCount, order),
        updatedAt: Date.now(),
      });
    });
  }

  /**
   * Stream-assemble an HTML report from persisted session data.
   * Memory: O(1) per screenshot — reads one image at a time, writes to HTML, then frees.
   * The dump JSON uses { $screenshot: id } references; images are written as
   * separate <script type="midscene-image"> tags that the viewer resolves.
   *
   * @param sessionId - Session to export
   * @param reportPath - Destination HTML file path
   * @param reportTpl - HTML template string (from getReportTpl())
   */
  streamReportToFile(
    sessionId: string,
    reportPath: string,
    reportTpl: string,
  ): void {
    withLock(sessionId, () => {
      const session = this.load(sessionId);
      const rootExecutionFiles = orderedRootExecutionFiles(
        this.sessionDir(sessionId),
      );

      if (!rootExecutionFiles.length) {
        throw new Error(`Session ${sessionId} has no persisted executions`);
      }

      // Write template (without closing </html>)
      const htmlCloseTag = '</html>';
      const tplCloseIdx = reportTpl.lastIndexOf(htmlCloseTag);
      const tplWithoutClose =
        tplCloseIdx !== -1 ? reportTpl.slice(0, tplCloseIdx) : reportTpl;
      writeFileSync(reportPath, tplWithoutClose, 'utf-8');

      // Stream image script tags — one screenshot at a time
      const writtenImages = new Set<string>();
      for (const fileName of rootExecutionFiles) {
        const basePath = join(this.sessionDir(sessionId), fileName);
        const screenshotsMapPath = `${basePath}.screenshots.json`;

        if (!existsSync(screenshotsMapPath)) continue;

        const screenshotMap: Record<string, string> = JSON.parse(
          readFileSync(screenshotsMapPath, 'utf-8'),
        );

        for (const [id, filePath] of Object.entries(screenshotMap)) {
          if (writtenImages.has(id)) continue;
          if (!existsSync(filePath)) continue;

          // Read one screenshot, write to HTML, free immediately
          const data = readFileSync(filePath);
          const mime =
            filePath.endsWith('.jpeg') || filePath.endsWith('.jpg')
              ? 'jpeg'
              : 'png';
          const base64 = `data:image/${mime};base64,${data.toString('base64')}`;
          appendFileSync(reportPath, `\n${generateImageScriptTag(id, base64)}`);
          writtenImages.add(id);
        }
      }

      // Build the dump JSON with $screenshot references (no image data)
      const executions: IExecutionDump[] = [];
      for (const fileName of rootExecutionFiles) {
        const basePath = join(this.sessionDir(sessionId), fileName);
        const dumpString = readFileSync(basePath, 'utf-8');
        executions.push(JSON.parse(dumpString) as IExecutionDump);
      }

      const groupedDump: IGroupedActionDump = {
        sdkVersion: session.sdkVersion,
        groupName: session.groupName,
        groupDescription: session.groupDescription,
        modelBriefs: session.modelBriefs,
        executions,
        deviceType: session.deviceType ?? session.platform,
      };

      const dumpJson = JSON.stringify(groupedDump);
      const dumpScript = `\n<script type="midscene_web_dump" type="application/json">\n${escapeScriptTag(dumpJson)}\n</script>`;
      appendFileSync(reportPath, dumpScript);

      // Close HTML
      appendFileSync(reportPath, `\n${htmlCloseTag}\n`);
    });
  }

  buildGroupedDump(sessionId: string): IGroupedActionDump {
    return withLock(sessionId, () => {
      const session = this.load(sessionId);
      const rootExecutionFiles = orderedRootExecutionFiles(
        this.sessionDir(sessionId),
      );

      if (!rootExecutionFiles.length) {
        throw new Error(`Session ${sessionId} has no persisted executions`);
      }

      const executions: IExecutionDump[] = [];
      for (const fileName of rootExecutionFiles) {
        const basePath = join(this.sessionDir(sessionId), fileName);
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
  }
}

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
