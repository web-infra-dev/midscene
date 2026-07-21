import { createReadStream } from 'node:fs';
import { type FileHandle, open, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  antiEscapeScriptTag,
  escapeScriptTag,
  uuid,
} from '@midscene/shared/utils';
import { type ExecutionDump, ReportActionDump } from '../types';

const SCRIPT_OPEN = Buffer.from('<script');
const SCRIPT_CLOSE = Buffer.from('</script>');
const READ_CHUNK_SIZE = 32 * 1024 * 1024;
const DUMP_TYPE_ATTRIBUTE = 'type="midscene_web_dump"';
const GROUP_ID_REGEXP = /data-group-id="([^"]+)"/;

interface ScriptTag {
  openTag: string;
  content: Buffer;
}

interface DumpGroup {
  baseDump: ReportActionDump;
  executionsByKey: Map<string, ExecutionDump>;
  firstOpenTag: string;
  noIdExecutionIndex: number;
  tagCount: number;
}

interface DumpAnalysis {
  groups: Map<string, DumpGroup>;
  tagCount: number;
}

export interface ReportDumpCompactionResult {
  beforeBytes: number;
  afterBytes: number;
  beforeDumpCount: number;
  afterDumpCount: number;
}

function decodeGroupId(openTag: string): string | undefined {
  if (!openTag.includes(DUMP_TYPE_ATTRIBUTE)) return undefined;
  const encodedGroupId = openTag.match(GROUP_ID_REGEXP)?.[1];
  return encodedGroupId ? decodeURIComponent(encodedGroupId) : undefined;
}

async function scanScriptTags(
  reportPath: string,
  onScript: (script: ScriptTag) => void | Promise<void>,
): Promise<void> {
  let pending: Buffer = Buffer.alloc(0);

  for await (const chunk of createReadStream(reportPath, {
    highWaterMark: READ_CHUNK_SIZE,
  })) {
    pending =
      pending.length === 0
        ? (chunk as Buffer)
        : Buffer.concat([pending, chunk as Buffer]);

    while (pending.length > 0) {
      const scriptStart = pending.indexOf(SCRIPT_OPEN);
      if (scriptStart === -1) {
        pending = pending.subarray(
          Math.max(0, pending.length - SCRIPT_OPEN.length + 1),
        );
        break;
      }

      if (scriptStart > 0) {
        pending = pending.subarray(scriptStart);
      }

      const openTagEnd = pending.indexOf(0x3e, SCRIPT_OPEN.length);
      if (openTagEnd === -1) break;

      const closeTagStart = pending.indexOf(SCRIPT_CLOSE, openTagEnd + 1);
      if (closeTagStart === -1) break;

      const scriptEnd = closeTagStart + SCRIPT_CLOSE.length;
      await onScript({
        openTag: pending.subarray(0, openTagEnd + 1).toString('utf-8'),
        content: pending.subarray(openTagEnd + 1, closeTagStart),
      });
      pending = pending.subarray(scriptEnd);
    }
  }

  if (pending.indexOf(SCRIPT_OPEN) !== -1) {
    throw new Error(
      `Report contains an unterminated script tag: ${reportPath}`,
    );
  }
}

async function analyzeDumpGroups(reportPath: string): Promise<DumpAnalysis> {
  const groups = new Map<string, DumpGroup>();
  let tagCount = 0;

  await scanScriptTags(reportPath, ({ openTag, content }) => {
    const groupId = decodeGroupId(openTag);
    if (!groupId) return;

    const dump = ReportActionDump.fromSerializedString(
      antiEscapeScriptTag(content.toString('utf-8').trim()),
    );
    let group = groups.get(groupId);
    if (!group) {
      group = {
        baseDump: dump,
        executionsByKey: new Map(),
        firstOpenTag: openTag,
        noIdExecutionIndex: 0,
        tagCount: 0,
      };
      groups.set(groupId, group);
    }

    group.tagCount += 1;
    tagCount += 1;
    for (const execution of dump.executions) {
      const executionKey = execution.id
        ? `id:${execution.id}`
        : `no-id:${group.noIdExecutionIndex++}`;
      group.executionsByKey.set(executionKey, execution);
    }
  });

  return { groups, tagCount };
}

function compactedDumpTag(group: DumpGroup): Buffer {
  group.baseDump.executions = Array.from(group.executionsByKey.values());
  const serialized = escapeScriptTag(group.baseDump.serialize());
  return Buffer.from(
    `${group.firstOpenTag}${serialized}${SCRIPT_CLOSE.toString('utf-8')}`,
  );
}

async function writeAll(handle: FileHandle, data: Buffer): Promise<void> {
  let offset = 0;
  while (offset < data.length) {
    const { bytesWritten } = await handle.write(
      data,
      offset,
      data.length - offset,
      null,
    );
    if (bytesWritten === 0) {
      throw new Error('Failed to make progress while writing compacted report');
    }
    offset += bytesWritten;
  }
}

async function rewriteReport(
  sourcePath: string,
  targetPath: string,
  analysis: DumpAnalysis,
): Promise<void> {
  const compactedTags = new Map(
    Array.from(analysis.groups, ([groupId, group]) => [
      groupId,
      compactedDumpTag(group),
    ]),
  );
  const seenTagsByGroup = new Map<string, number>();
  const emittedGroups = new Set<string>();
  const output = await open(targetPath, 'wx');
  let pending: Buffer = Buffer.alloc(0);

  try {
    for await (const chunk of createReadStream(sourcePath, {
      highWaterMark: READ_CHUNK_SIZE,
    })) {
      pending =
        pending.length === 0
          ? (chunk as Buffer)
          : Buffer.concat([pending, chunk as Buffer]);

      while (pending.length > 0) {
        const scriptStart = pending.indexOf(SCRIPT_OPEN);
        if (scriptStart === -1) {
          const writableLength = Math.max(
            0,
            pending.length - SCRIPT_OPEN.length + 1,
          );
          await writeAll(output, pending.subarray(0, writableLength));
          pending = pending.subarray(writableLength);
          break;
        }

        await writeAll(output, pending.subarray(0, scriptStart));
        pending = pending.subarray(scriptStart);

        const openTagEnd = pending.indexOf(0x3e, SCRIPT_OPEN.length);
        if (openTagEnd === -1) break;

        const closeTagStart = pending.indexOf(SCRIPT_CLOSE, openTagEnd + 1);
        if (closeTagStart === -1) break;

        const scriptEnd = closeTagStart + SCRIPT_CLOSE.length;
        const openTag = pending.subarray(0, openTagEnd + 1).toString('utf-8');
        const groupId = decodeGroupId(openTag);

        if (!groupId || !analysis.groups.has(groupId)) {
          await writeAll(output, pending.subarray(0, scriptEnd));
        } else {
          const seenCount = (seenTagsByGroup.get(groupId) ?? 0) + 1;
          seenTagsByGroup.set(groupId, seenCount);
          if (seenCount === analysis.groups.get(groupId)!.tagCount) {
            await writeAll(output, compactedTags.get(groupId)!);
            emittedGroups.add(groupId);
          }
        }
        pending = pending.subarray(scriptEnd);
      }
    }

    if (pending.indexOf(SCRIPT_OPEN) !== -1) {
      throw new Error(
        `Report contains an unterminated script tag: ${sourcePath}`,
      );
    }
    await writeAll(output, pending);

    for (const [groupId, group] of analysis.groups) {
      if (
        seenTagsByGroup.get(groupId) !== group.tagCount ||
        !emittedGroups.has(groupId)
      ) {
        throw new Error(
          `Report compaction did not rewrite every dump in group: ${groupId}`,
        );
      }
    }
    await output.sync();
  } finally {
    await output.close();
  }
}

function canRetryRenameOnWindows(error: unknown): boolean {
  if (process.platform !== 'win32') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EACCES' || code === 'EEXIST' || code === 'EPERM';
}

async function replaceReportFile(
  temporaryPath: string,
  reportPath: string,
): Promise<void> {
  try {
    await rename(temporaryPath, reportPath);
    return;
  } catch (error) {
    if (!canRetryRenameOnWindows(error)) throw error;
  }

  const backupPath = join(
    dirname(reportPath),
    `.${basename(reportPath)}.${uuid()}.backup`,
  );
  await rename(reportPath, backupPath);
  try {
    await rename(temporaryPath, reportPath);
  } catch (replaceError) {
    try {
      await rename(backupPath, reportPath);
    } catch (restoreError) {
      throw new Error(
        `Failed to replace compacted report and restore the original report: ${String(replaceError)}; restore error: ${String(restoreError)}`,
      );
    }
    throw replaceError;
  }
  await unlink(backupPath);
}

export async function compactReportDumps(
  reportPath: string,
): Promise<ReportDumpCompactionResult> {
  const before = await stat(reportPath);
  const analysis = await analyzeDumpGroups(reportPath);
  const afterDumpCount = analysis.groups.size;

  if (analysis.tagCount <= afterDumpCount) {
    return {
      beforeBytes: before.size,
      afterBytes: before.size,
      beforeDumpCount: analysis.tagCount,
      afterDumpCount,
    };
  }

  const temporaryPath = join(
    dirname(reportPath),
    `.${basename(reportPath)}.${uuid()}.tmp`,
  );

  try {
    await rewriteReport(reportPath, temporaryPath, analysis);
    const after = await stat(temporaryPath);
    await replaceReportFile(temporaryPath, reportPath);
    return {
      beforeBytes: before.size,
      afterBytes: after.size,
      beforeDumpCount: analysis.tagCount,
      afterDumpCount,
    };
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(
          `Report compaction failed and the temporary file could not be removed: ${String(error)}; cleanup error: ${String(cleanupError)}`,
        );
      }
    }
    throw error;
  }
}
