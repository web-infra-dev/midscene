import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import * as fsAsync from 'node:fs/promises';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { antiEscapeScriptTag, logMsg, uuid } from '@midscene/shared/utils';
import { getReportFileName } from './agent/report-file-name';
import {
  DATA_SCREENSHOT_MODE_ATTR,
  extractLastDumpScriptSync,
  generateAgentReportComment,
  getBaseUrlFixScript,
  generateTestRunReportScriptTag as runnerDumpScript,
  streamDumpScriptsSync,
  streamImageScriptsToFile,
} from './dump/html-utils';
import {
  imageRefFileExtension,
  normalizeStoredImageRef,
} from './dump/image-reference';
import {
  readReportArtifactManifest,
  readReportDumpScripts,
  readReportRunnerDump,
  streamReportDumpScripts,
} from './dump/report-artifact-reader';
import {
  parseBase64ImageDataUrl,
  resolveImageSource,
} from './dump/screenshot-store';
export {
  readReportActionDump,
  readReportArtifactManifestAsync,
  readReportArtifactManifest,
  readReportDumpScripts,
  readReportRunnerDump,
  streamReportDumpScripts,
} from './dump/report-artifact-reader';
export { ExecutionRecorder } from './dump/execution-recorder';
export { ReportArtifactStore } from './dump/report-artifact-store';
export { ReportSession } from './dump/report-session';
import {
  ReportArtifactWriter,
  type ReportGroupAttributes,
} from './dump/report-artifact-writer';
import { collectReportSummary } from './report-stats';
import type {
  AssembleTestRunReportOptions,
  IndexedTestRunReportSource,
  TestRunReportMetrics,
  TestRunReportSource,
  TestRunReportSourceIndex,
} from './test-run-report';
import {
  type MergeTestRunReportSource,
  mergeTestRunReportDumps,
} from './test-runner/reporting/merge-report';
import { collectTestRunReportMetrics } from './test-runner/reporting/metrics';
import {
  type ExecutionDump,
  type IExecutionDump,
  ReportActionDump,
  type ScreenshotMode,
} from './types';
import type { ReportFileWithAttributes } from './types';
import { getReportTpl, getVersion, reportHTMLContent } from './utils';

export {
  calculateTestRunHealth,
  classifyTestRunCase,
} from './test-run-health';

export interface ExportReportArtifactOptions {
  reportPath: string;
  outputDir: string;
  reportFileName: string;
  outputFormat?: 'single-html' | 'html-and-external-assets';
  overwrite?: boolean;
}

/** Export only referenced facts and images, validating them before publishing. */
export async function exportReportArtifact(
  options: ExportReportArtifactOptions,
): Promise<string> {
  validateTestRunReportFileName(options.reportFileName);
  const input = path.resolve(options.reportPath);
  const output = path.resolve(options.outputDir);
  const external = options.outputFormat === 'html-and-external-assets';
  const artifact = path.join(output, options.reportFileName);
  const destination = external
    ? path.join(artifact, 'index.html')
    : `${artifact}.html`;
  if (input === destination || input.startsWith(`${artifact}${path.sep}`))
    throw new Error('Export destination must differ from the input report.');
  if (!options.overwrite && [artifact, `${artifact}.html`].some(existsSync))
    throw new Error(`Report artifact already exists: ${artifact}`);
  const manifest = readReportArtifactManifest(input);
  const runner = readReportRunnerDump(input);
  const groups = new Map<
    string,
    { dump: ReportActionDump; attributes: ReportGroupAttributes }
  >();
  for (const source of readReportDumpScripts(input)) {
    const attributes = Object.fromEntries(
      [...source.openTag.matchAll(/([^\s=]+)="([^"]*)"/g)]
        .filter(([, key]) => key !== 'type')
        .map(([, key, value]) => [key, decodeURIComponent(value)]),
    );
    const id = attributes['data-group-id'];
    if (!id) throw new Error('Report execution group is missing its ID.');
    const dump = ReportActionDump.fromSerializedString(
      manifest ? source.content : antiEscapeScriptTag(source.content),
    );
    const previous = groups.get(id);
    dump.executions = dedupeExecutionsKeepLatest([
      ...(previous?.dump.executions ?? []),
      ...dump.executions,
    ]);
    groups.set(id, { dump, attributes });
  }
  if (!groups.size && !runner)
    throw new Error('No report execution data was found in the input.');
  const hint = [...groups.values()][0]?.attributes['data-report-kind'];
  const kind =
    manifest?.kind ??
    (hint === 'agent' || hint === 'test' ? hint : runner ? 'test' : 'agent');
  await fsAsync.mkdir(output, { recursive: true });
  const temporary = await fsAsync.mkdtemp(path.join(output, '.report-export-'));
  const entry = path.join(temporary, 'index.html');
  try {
    const writer = new ReportArtifactWriter(
      entry,
      external,
      kind,
      manifest?.reportId ?? runner?.runId,
    );
    await writer.initialize();
    for (const [id, group] of groups)
      await writer.addGroup(
        id,
        group.dump.serialize(),
        input,
        group.attributes,
      );
    await writer.finish(
      runner,
      mergedAgentReportComment([...groups.values()].map((group) => group.dump)),
    );
    if (options.overwrite) {
      await fsAsync.rm(artifact, { recursive: true, force: true });
      await fsAsync.rm(`${artifact}.html`, { force: true });
    }
    await fsAsync.rename(
      external ? temporary : entry,
      external ? artifact : destination,
    );
    return destination;
  } finally {
    await fsAsync.rm(temporary, { recursive: true, force: true });
  }
}

/**
 * Read the screenshot storage mode a report declared at generation time.
 *
 * Reports written by current versions stamp `data-screenshot-mode` onto every
 * dump script tag, so we only need to peek at the first real dump script (the
 * template's bundled JS also references the dump type string, hence the
 * `data-group-id` filter) and can stop streaming immediately.
 *
 * Returns undefined for legacy reports that predate the attribute or for
 * unreadable files, letting the caller fall back to a filesystem heuristic.
 */
const screenshotModeAttrRegExp = new RegExp(
  `${DATA_SCREENSHOT_MODE_ATTR}="(inline|directory)"`,
);

function readDeclaredScreenshotMode(
  reportFilePath: string,
): ScreenshotMode | undefined {
  let mode: ScreenshotMode | undefined;
  try {
    streamDumpScriptsSync(reportFilePath, ({ openTag }) => {
      // Skip false matches from the template's bundled JS code.
      if (!openTag.includes('data-group-id')) return false;
      const match = openTag.match(screenshotModeAttrRegExp);
      mode = match?.[1] as ScreenshotMode | undefined;
      return true; // the first real dump script decides the mode
    });
  } catch {
    // Unreadable / non-existent file — let the caller fall back.
  }
  return mode;
}

/**
 * Check if a report is in directory mode (html-and-external-assets).
 * Directory mode reports: {name}/index.html + {name}/screenshots/
 *
 * The mode is read from the report's own `data-screenshot-mode` metadata, which
 * is authoritative regardless of whether the run happened to capture any
 * screenshots. For legacy reports without the attribute we fall back to the old
 * filesystem heuristic (an `index.html` that has a sibling `screenshots/` dir).
 */
export function isDirectoryModeReport(reportFilePath: string): boolean {
  if (readReportArtifactManifest(reportFilePath)) return true;
  // Agent directory reports use index.html by default. Reports without the
  // versioned manifest use the existing metadata and layout heuristic.
  if (path.basename(reportFilePath) !== 'index.html') return false;

  const declared = readDeclaredScreenshotMode(reportFilePath);
  if (declared) return declared === 'directory';

  // Legacy fallback for reports generated before screenshotMode was embedded.
  return existsSync(path.join(path.dirname(reportFilePath), 'screenshots'));
}

/**
 * Whether a report lives in its own dedicated directory (`{name}/index.html`)
 * rather than being a single standalone file (`{name}.html`).
 *
 * This is a structural fact about *where the report file sits*, independent of
 * how it stores screenshots: a directory report can keep screenshots external
 * (a `screenshots/` sibling) OR inline them into `index.html`. Deletion needs
 * this — not the screenshot mode — to decide whether to remove the whole
 * directory or just unlink a file, so that an inline-screenshot report nested in
 * its own folder still has the folder removed instead of being orphaned.
 */
function isDirectoryBasedReport(reportFilePath: string): boolean {
  return path.basename(reportFilePath) === 'index.html';
}

/**
 * Remove a complete report artifact from disk.
 *
 * Standalone reports own only their HTML file, while directory-based reports
 * own the directory containing `index.html`. Callers must decide whether they
 * own the source artifact and should only invoke this after its replacement
 * has been produced successfully.
 *
 * @param reportFilePath Path to the standalone report or directory report's
 * `index.html` entry point.
 * @throws When the owned report artifact cannot be removed.
 */
export function removeReportArtifact(reportFilePath: string): void {
  if (isDirectoryBasedReport(reportFilePath)) {
    rmSync(path.dirname(reportFilePath), { recursive: true, force: true });
    return;
  }
  unlinkSync(reportFilePath);
}

/**
 * Deduplicate executions by stable id, keeping only the last occurrence.
 * Old-format executions without id are always preserved.
 */
export function dedupeExecutionsKeepLatest<T extends Pick<ExecutionDump, 'id'>>(
  executions: T[],
): T[] {
  let noIdCounter = 0;
  const deduped = new Map<string, T>();
  for (const exec of executions) {
    const key = exec.id || `__no_id_${noIdCounter++}`;
    deduped.set(key, exec);
  }
  return Array.from(deduped.values());
}
/**
 * Peek at the first `sdkVersion` field embedded in a midscene_web_dump
 * script tag inside the given report file. Returns undefined if no
 * recognizable tag or sdkVersion is present.
 */
function peekReportSdkVersion(reportFilePath: string): string | undefined {
  try {
    let dump: string | undefined;
    streamReportDumpScripts(reportFilePath, ({ content }) => {
      dump = content;
      return true;
    });
    dump ??= extractLastDumpScriptSync(reportFilePath) ?? undefined;
    if (!dump) return undefined;
    const match = dump.match(/"sdkVersion"\s*:\s*"([^"]+)"/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

const warnedMismatchedVersions = new Set<string>();

function tryParseAgentReportDump(dumpString: string): ReportActionDump | null {
  const trimmed = dumpString.trimStart();
  if (!trimmed.startsWith('{') || !trimmed.includes('"executions"')) {
    return null;
  }

  try {
    return ReportActionDump.fromSerializedString(trimmed);
  } catch {
    return null;
  }
}

function mergedAgentReportComment(reports: ReportActionDump[]): string {
  if (reports.length === 0) {
    return '';
  }
  if (reports.length === 1) {
    return generateAgentReportComment(reports[0]);
  }

  const deviceTypes = Array.from(
    new Set(reports.map((report) => report.deviceType).filter(Boolean)),
  );
  const mergedReport = new ReportActionDump({
    sdkVersion: reports[0].sdkVersion || getVersion(),
    groupName: 'Merged Midscene Report',
    groupDescription: 'Agent-readable summary for merged report HTML',
    modelBriefs: reports.flatMap((report) => report.modelBriefs ?? []),
    deviceType: deviceTypes.length === 1 ? deviceTypes[0] : 'mixed',
    executions: dedupeExecutionsKeepLatest(
      reports.flatMap((report) => report.executions ?? []),
    ),
  });
  return generateAgentReportComment(mergedReport);
}

export class ReportMergingTool {
  private reportInfos: ReportFileWithAttributes[] = [];

  private createEmptyDumpString(groupName: string, groupDescription?: string) {
    return new ReportActionDump({
      sdkVersion: '',
      groupName,
      groupDescription,
      modelBriefs: [],
      executions: [],
    }).serialize();
  }

  public append(reportInfo: ReportFileWithAttributes) {
    if (
      !reportInfo.reportFilePath &&
      reportInfo.reportAttributes.testStatus !== 'skipped'
    ) {
      throw new Error(
        'reportFilePath is required unless reportAttributes.testStatus is "skipped"',
      );
    }

    if (reportInfo.reportFilePath) {
      const sourceVersion = peekReportSdkVersion(reportInfo.reportFilePath);
      const currentVersion = getVersion();
      if (
        sourceVersion &&
        currentVersion &&
        sourceVersion !== currentVersion &&
        !warnedMismatchedVersions.has(sourceVersion)
      ) {
        warnedMismatchedVersions.add(sourceVersion);
        logMsg(
          `[@midscene/core] ReportMergingTool version mismatch: source report was written by @midscene/core@${sourceVersion} but the merger is @midscene/core@${currentVersion}. This commonly means @midscene/core and the device package (e.g. @midscene/android) resolve to different versions in node_modules. Merged output may silently drop intermediate steps. Align the versions and reinstall (rm -rf node_modules package-lock.json && npm install).`,
        );
      }
    }
    this.reportInfos.push(reportInfo);
  }
  public clear() {
    this.reportInfos = [];
  }

  /**
   * Merge multiple dump script contents (from the same source report)
   * into a single serialized ReportActionDump string.
   * If there's only one dump, return it as-is. If multiple, merge
   * all executions into the first dump's group structure.
   */
  private mergeDumpScripts(contents: string[], external: boolean): string {
    const unescaped = contents
      .map((c) => (external ? c : antiEscapeScriptTag(c)))
      .filter((c) => c.length > 0);
    if (unescaped.length === 0) return '';
    if (unescaped.length === 1) return unescaped[0];

    // Parse all dumps and collect executions, deduplicating by id (keep last).
    // Only executions with a stable id are deduped; old-format entries without
    // id are always kept (they may be distinct despite sharing the same name).
    const base = ReportActionDump.fromSerializedString(unescaped[0]);
    const allExecutions = [...base.executions];
    for (let i = 1; i < unescaped.length; i++) {
      const other = ReportActionDump.fromSerializedString(unescaped[i]);
      allExecutions.push(...other.executions);
    }
    base.executions = dedupeExecutionsKeepLatest(allExecutions);
    return base.serialize();
  }

  public mergeReports(
    reportFileName: 'AUTO' | string = 'AUTO',
    opts: {
      rmOriginalReports?: boolean;
      overwrite?: boolean;
      outputDir?: string;
      outputFormat?: 'single-html' | 'html-and-external-assets';
    } = {},
  ): string | null {
    const {
      rmOriginalReports = false,
      overwrite = false,
      outputDir,
      outputFormat,
    } = opts;
    if (!this.reportInfos.length) {
      logMsg('No reports to merge');
      return null;
    }
    const runnerDumps = this.reportInfos.map((info) =>
      info.reportFilePath
        ? readReportRunnerDump(info.reportFilePath)
        : undefined,
    );
    const hasRunnerDump = runnerDumps.some(Boolean);
    const external = outputFormat === 'html-and-external-assets';
    const name =
      reportFileName === 'AUTO'
        ? getReportFileName('merged-report')
        : reportFileName;
    validateTestRunReportFileName(name);
    const targetDir = outputDir
      ? path.resolve(outputDir)
      : getMidsceneRunSubDir('report');
    mkdirSync(targetDir, { recursive: true });
    const artifact = path.join(targetDir, name);
    const outputFilePath = external
      ? path.join(artifact, 'index.html')
      : `${artifact}.html`;
    if (!overwrite && [artifact, `${artifact}.html`].some(existsSync))
      throw new Error(
        `Report file already exists: ${outputFilePath}\nSet overwrite to true to overwrite this file.`,
      );
    if (
      rmOriginalReports &&
      this.reportInfos.some(
        (info) =>
          info.reportFilePath &&
          isDirectoryBasedReport(info.reportFilePath) &&
          outputFilePath.startsWith(
            `${path.dirname(path.resolve(info.reportFilePath))}${path.sep}`,
          ),
      )
    )
      throw new Error(
        'Merged output must be outside source report directories when removing originals.',
      );
    const temporary = mkdtempSync(path.join(targetDir, '.merged-report-'));
    const entry = path.join(temporary, 'index.html');
    try {
      const writer = new ReportArtifactWriter(
        entry,
        external,
        hasRunnerDump ? 'test' : 'agent',
      );
      writer.initializeSync();
      const agentReports: ReportActionDump[] = [];
      const runnerSources: MergeTestRunReportSource[] = [];
      const groupIds = new Set<string>();
      for (const [index, info] of this.reportInfos.entries()) {
        const attributes = info.reportAttributes;
        let serialized = this.createEmptyDumpString(
          attributes.testTitle,
          attributes.testDescription,
        );
        let groupId = `merged-group-${index}`;
        if (info.reportFilePath) {
          const dumps = readReportDumpScripts(info.reportFilePath);
          const originalId = dumps[0]?.openTag.match(
            /data-group-id="([^"]+)"/,
          )?.[1];
          if (
            originalId &&
            !hasRunnerDump &&
            !groupIds.has(decodeURIComponent(originalId))
          )
            groupId = decodeURIComponent(originalId);
          serialized = dumps.length
            ? this.mergeDumpScripts(
                dumps.map((dump) => dump.content),
                Boolean(readReportArtifactManifest(info.reportFilePath)),
              )
            : (extractLastDumpScriptSync(info.reportFilePath) ?? serialized);
        }
        if (groupIds.has(groupId)) groupId = `merged-group-${uuid()}`;
        groupIds.add(groupId);
        const agentReport = tryParseAgentReportDump(serialized);
        if (agentReport) agentReports.push(agentReport);
        if (hasRunnerDump)
          runnerSources.push({
            reportId: groupId,
            sourcePath: info.reportFilePath ?? '<skipped-agent-report>',
            attributes,
            dump: runnerDumps[index],
            timing: agentReport
              ? agentReportTiming(agentReport, attributes.testDuration)
              : undefined,
          });
        writer.addGroupSync(groupId, serialized, info.reportFilePath ?? entry, {
          ...(hasRunnerDump ? { 'data-report-id': groupId } : {}),
          playwright_test_duration: attributes.testDuration,
          playwright_test_status: attributes.testStatus,
          playwright_test_title: attributes.testTitle,
          playwright_test_id: attributes.testId,
          playwright_test_description: attributes.testDescription,
          is_merged: true,
        });
      }
      let runner;
      if (hasRunnerDump) {
        const executions = dedupeExecutionsKeepLatest(
          agentReports.flatMap((report) => report.executions),
        );
        const metrics = collectTestRunReportMetrics({ executions });
        const executionMetrics = Object.fromEntries(
          executions.flatMap((execution) =>
            execution.id
              ? [
                  [
                    execution.id,
                    collectTestRunReportMetrics({ executions: [execution] }),
                  ],
                ]
              : [],
          ),
        );
        runner = mergeTestRunReportDumps(
          runnerSources,
          metrics,
          uuid(),
          executionMetrics,
        );
      }
      writer.finishSync(runner, mergedAgentReportComment(agentReports));
      if (overwrite) {
        rmSync(artifact, { recursive: true, force: true });
        rmSync(`${artifact}.html`, { force: true });
      }
      renameSync(
        external ? temporary : entry,
        external ? artifact : outputFilePath,
      );
      if (rmOriginalReports)
        for (const info of this.reportInfos) {
          if (
            info.reportFilePath &&
            path.resolve(info.reportFilePath) !== outputFilePath
          )
            removeReportArtifact(info.reportFilePath);
        }
      logMsg(`Successfully merged new report: ${outputFilePath}`);
      return outputFilePath;
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}

function agentReportTiming(
  report: ReportActionDump,
  durationMs: number,
): MergeTestRunReportSource['timing'] {
  const timing = collectReportSummary(report).timing;
  const executionTimes = report.executions
    .map((execution) => execution.logTime)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
    );
  const started =
    timing.wallTimeStart ??
    (executionTimes.length ? Math.min(...executionTimes) : undefined);
  if (started === undefined) return undefined;
  const ended =
    timing.wallTimeEnd ??
    Math.max(
      ...executionTimes,
      started + (Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0),
    );
  return {
    startedAt: new Date(started).toISOString(),
    endedAt: new Date(ended).toISOString(),
    durationMs: Math.max(0, ended - started),
  };
}

interface PreparedTestRunReportSource extends IndexedTestRunReportSource {
  dump: ReportActionDump;
  dumpPath?: string;
  imageOrigins: Map<string, string>;
}

const validateTestRunReportFileName = (fileName: string): void => {
  if (
    !fileName ||
    fileName === '.' ||
    fileName === '..' ||
    path.basename(fileName) !== fileName ||
    fileName.endsWith('.html')
  ) {
    throw new Error(
      `Midscene Test reportFileName must be one path segment without an extension: ${fileName}`,
    );
  }
};

const uniqueTestRunReportSources = (
  sources: readonly TestRunReportSource[],
): TestRunReportSource[] => {
  const unique = new Map<string, TestRunReportSource>();

  for (const source of sources) {
    const scopeId = source.scopeId.trim();
    const sourcePath = path.resolve(source.sourcePath);
    if (!scopeId) {
      throw new Error('Midscene Test report source scopeId must not be empty.');
    }

    unique.set(`${scopeId}\u0000${source.dumpPath ?? sourcePath}`, {
      ...source,
      scopeId,
      sourcePath,
    });
  }

  return [...unique.values()];
};

const prepareTestRunReportSources = (
  sources: readonly TestRunReportSource[],
  loadedDumps?: ReadonlyMap<string, string | Error>,
): {
  sources: PreparedTestRunReportSource[];
  metrics: TestRunReportMetrics;
  capturedMetrics: TestRunReportMetrics;
  executionMetrics: Record<string, TestRunReportMetrics>;
  diagnostics: import('./test-run-report').TestRunReportDiagnostic[];
} => {
  const prepared: PreparedTestRunReportSource[] = [];
  const diagnostics: import('./test-run-report').TestRunReportDiagnostic[] = [];
  const ownerByScopedExecution = new Map<string, string>();
  const preparedByPath = new Map<string, PreparedTestRunReportSource>();

  for (const [sourceIndex, source] of uniqueTestRunReportSources(
    sources,
  ).entries()) {
    let baseDump: ReportActionDump;
    let executions: IExecutionDump[];
    try {
      if (source.dumpPath) {
        const contents =
          loadedDumps?.get(source.dumpPath) ??
          readFileSync(source.dumpPath, 'utf8');
        if (contents instanceof Error) throw contents;
        baseDump = ReportActionDump.fromSerializedString(contents);
        executions = baseDump.executions;
      } else {
        if (!existsSync(source.sourcePath))
          throw new Error(`Agent report does not exist: ${source.sourcePath}`);
        const sourceVersion = peekReportSdkVersion(source.sourcePath);
        const currentVersion = getVersion();
        if (
          sourceVersion &&
          currentVersion &&
          sourceVersion !== currentVersion &&
          !warnedMismatchedVersions.has(sourceVersion)
        ) {
          warnedMismatchedVersions.add(sourceVersion);
          logMsg(
            `[@midscene/core] TestRunReportAssembler version mismatch: source report was written by @midscene/core@${sourceVersion} but the assembler is @midscene/core@${currentVersion}. Align the workspace package versions before generating the Midscene Test report.`,
          );
        }
        ({ baseDump, executions } = collectDedupedExecutions(
          source.sourcePath,
        ));
      }
    } catch (error) {
      diagnostics.push({
        level: 'warning',
        code: 'agent-source-unavailable',
        scopeId: source.scopeId,
        sourcePaths: [source.sourcePath],
        message: `Agent source could not be collected: ${String(error)}`,
      });
      continue;
    }
    // A borrowed Agent can serve several sequential test scopes. Reuse its
    // report group and metrics while indexing each scope's execution links.
    const sourceKey = source.sourcePath;
    const imageOrigins = new Map<string, string>();
    JSON.parse(baseDump.serialize(), (_key, value) => {
      const ref = normalizeStoredImageRef(value);
      if (ref)
        imageOrigins.set(
          ref.id,
          ref.storage === 'file'
            ? (source.dumpPath ?? source.sourcePath)
            : source.sourcePath,
        );
      return value;
    });
    const shared = preparedByPath.get(sourceKey);
    if (shared) {
      for (const [id, origin] of imageOrigins)
        shared.imageOrigins.set(id, origin);
      if (source.dumpPath) {
        shared.dump.executions = dedupeExecutionsKeepLatest([
          ...shared.dump.executions,
          ...baseDump.executions,
        ]);
      }
      const scoped = prepared.find(
        (item) =>
          item.reportId === shared.reportId && item.scopeId === source.scopeId,
      );
      const executionIds = [
        ...new Set([
          ...(scoped?.executionIds ?? []),
          ...executions.flatMap((execution) =>
            execution.id ? [execution.id] : [],
          ),
        ]),
      ];
      for (const executionId of executionIds) {
        const key = `${source.scopeId}\u0000${executionId}`;
        const owner = ownerByScopedExecution.get(key);
        if (owner && owner !== shared.reportId)
          throw new Error(
            `Agent execution ${executionId} is present in multiple reports for test scope ${source.scopeId}: ${owner}, ${shared.reportId}`,
          );
        ownerByScopedExecution.set(key, shared.reportId);
      }
      if (scoped) {
        scoped.executionIds = executionIds;
        const partial = [scoped.collection, source.collection].find(
          (collection) => collection?.status === 'partial',
        );
        scoped.collection = partial ?? source.collection ?? scoped.collection;
      } else
        prepared.push({
          ...shared,
          scopeId: source.scopeId,
          executionIds,
          collection: source.collection,
        });
      continue;
    }
    const reportId = `runner-report-${sourceIndex + 1}`;
    const executionIds: string[] = [];
    for (const execution of executions) {
      if (!execution.id) continue;
      const scopedExecution = `${source.scopeId}\u0000${execution.id}`;
      const previousOwner = ownerByScopedExecution.get(scopedExecution);
      if (previousOwner && previousOwner !== reportId) {
        throw new Error(
          `Agent execution ${execution.id} is present in multiple reports for test scope ${source.scopeId}: ${previousOwner}, ${reportId}`,
        );
      }
      ownerByScopedExecution.set(scopedExecution, reportId);
      executionIds.push(execution.id);
    }

    const dump = new ReportActionDump({
      sdkVersion: baseDump.sdkVersion,
      groupName: baseDump.groupName,
      groupDescription: baseDump.groupDescription,
      modelBriefs: baseDump.modelBriefs,
      deviceType: baseDump.deviceType,
      executions,
    });
    const preparedSource = {
      reportId,
      scopeId: source.scopeId,
      sourcePath: source.sourcePath,
      executionIds,
      collection: source.collection,
      dump,
      imageOrigins,
      ...(source.dumpPath ? { dumpPath: source.dumpPath } : {}),
    };
    prepared.push(preparedSource);
    preparedByPath.set(sourceKey, preparedSource);
  }

  // A legacy invocation can preserve a snapshot of an Agent also used by
  // native scopes. Count stable executions once across both paths.
  const executions = dedupeExecutionsKeepLatest(
    [...preparedByPath.values()].flatMap((source) => source.dump.executions),
  );
  const metrics = collectTestRunReportMetrics({ executions });
  const executionMetrics = Object.fromEntries(
    executions.flatMap((execution) =>
      execution.id
        ? [
            [
              execution.id,
              collectTestRunReportMetrics({ executions: [execution] }),
            ],
          ]
        : [],
    ),
  );
  return {
    sources: prepared,
    diagnostics,
    capturedMetrics: metrics,
    executionMetrics,
    metrics: {
      ...metrics,
      collection: {
        ...metrics.collection!,
        fields: Object.fromEntries(
          Object.entries(metrics.collection!.fields!).map(([field, status]) => [
            field,
            diagnostics.length
              ? prepared.length === 0
                ? 'unknown'
                : status === 'complete'
                  ? 'partial'
                  : status
              : status,
          ]),
        ) as NonNullable<
          NonNullable<TestRunReportMetrics['collection']>['fields']
        >,
        status: diagnostics.length
          ? prepared.length
            ? 'partial'
            : 'unknown'
          : metrics.collection!.status,
        expectedExecutionCount: 0,
        capturedExecutionCount: 0,
        reasons: [
          ...metrics.collection!.reasons,
          ...diagnostics.map((diagnostic) => diagnostic.message),
        ],
      },
    },
  };
};

/**
 * Build a self-contained Midscene Test report while preserving the existing
 * Agent dump format consumed by the Report App.
 *
 * Test hierarchy and status live in `midscene_test_run_dump`; Agent reports
 * remain independent `midscene_web_dump` groups addressed by `data-report-id`.
 */
export class TestRunReportAssembler {
  /** Runtime publisher: current Agent snapshots avoid parsing HTML or copying unused images. */
  public async assembleAsync(
    options: AssembleTestRunReportOptions,
  ): Promise<string> {
    validateTestRunReportFileName(options.reportFileName);
    const loaded = new Map<string, string | Error>();
    await Promise.all(
      options.sources.map(async (source) => {
        if (source.dumpPath) {
          try {
            loaded.set(
              source.dumpPath,
              await fsAsync.readFile(source.dumpPath, 'utf8'),
            );
          } catch (error) {
            loaded.set(
              source.dumpPath,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      }),
    );
    const prepared = prepareTestRunReportSources(options.sources, loaded);
    const dump = options.buildRunnerDump({
      sources: prepared.sources,
      metrics: prepared.metrics,
      capturedMetrics: prepared.capturedMetrics,
      executionMetrics: prepared.executionMetrics,
      diagnostics: prepared.diagnostics,
    });
    if (dump.kind !== 'test-runner' || dump.schemaVersion !== 1)
      throw new Error('Invalid Runner report dump');
    const directoryMode = options.outputFormat === 'html-and-external-assets';
    const outputDir = path.resolve(options.outputDir);
    await fsAsync.mkdir(outputDir, { recursive: true });
    const artifact = path.join(outputDir, options.reportFileName);
    const finalPath = directoryMode
      ? path.join(artifact, 'index.html')
      : `${artifact}.html`;
    if (
      !options.overwrite &&
      (existsSync(artifact) || existsSync(`${artifact}.html`))
    )
      throw new Error(`Report artifact already exists: ${artifact}`);
    const temporary = await fsAsync.mkdtemp(
      path.join(outputDir, '.test-run-report-'),
    );
    const htmlPath = path.join(temporary, 'index.html');
    try {
      const writer = new ReportArtifactWriter(
        htmlPath,
        directoryMode,
        'test',
        dump.runId,
      );
      await writer.initialize();
      const reports: ReportActionDump[] = [];
      for (const source of new Map(
        prepared.sources.map((source) => [source.reportId, source]),
      ).values()) {
        reports.push(source.dump);
        await writer.addGroup(
          source.reportId,
          source.dump.serialize(),
          source.dumpPath ?? source.sourcePath,
          {
            'data-report-id': source.reportId,
            'data-runner-scope-id': source.scopeId,
          },
          source.imageOrigins,
        );
      }
      await writer.finish(dump, mergedAgentReportComment(reports));
      if (options.overwrite) {
        await fsAsync.rm(artifact, { recursive: true, force: true });
        await fsAsync.rm(`${artifact}.html`, { force: true });
      }
      await fsAsync.rename(
        directoryMode ? temporary : htmlPath,
        directoryMode ? artifact : finalPath,
      );
      return finalPath;
    } finally {
      await fsAsync.rm(temporary, { recursive: true, force: true });
    }
  }

  public assemble(options: AssembleTestRunReportOptions): string {
    validateTestRunReportFileName(options.reportFileName);
    const outputDir = path.resolve(options.outputDir);
    mkdirSync(outputDir, { recursive: true });

    const prepared = prepareTestRunReportSources(options.sources);
    const index: TestRunReportSourceIndex = {
      sources: prepared.sources.map(
        ({ reportId, scopeId, sourcePath, executionIds, collection }) => ({
          reportId,
          scopeId,
          sourcePath,
          executionIds,
          collection,
        }),
      ),
      metrics: prepared.metrics,
      capturedMetrics: prepared.capturedMetrics,
      executionMetrics: prepared.executionMetrics,
      diagnostics: prepared.diagnostics,
    };
    const runnerDump = options.buildRunnerDump(index);
    if (runnerDump.schemaVersion !== 1 || runnerDump.kind !== 'test-runner') {
      throw new Error(
        'buildRunnerDump must return a Midscene Test report dump with schemaVersion 1 and kind "test-runner".',
      );
    }
    // Validate serializability before creating any output artifact.
    JSON.stringify(runnerDump);

    const directoryMode = options.outputFormat === 'html-and-external-assets';
    const finalArtifactPath = path.join(outputDir, options.reportFileName);
    const directoryReportPath = path.join(finalArtifactPath, 'index.html');
    const standaloneReportPath = `${finalArtifactPath}.html`;
    const finalReportPath = directoryMode
      ? directoryReportPath
      : standaloneReportPath;
    const existingArtifacts = [finalArtifactPath, standaloneReportPath].filter(
      existsSync,
    );
    if (existingArtifacts.length > 0 && !options.overwrite) {
      throw new Error(
        `Report artifact already exists: ${existingArtifacts[0]}\nSet overwrite to true to overwrite this report.`,
      );
    }

    const temporaryRoot = mkdtempSync(
      path.join(outputDir, '.test-run-report-'),
    );
    const temporaryArtifactPath = path.join(
      temporaryRoot,
      options.reportFileName,
    );
    const temporaryReportPath = directoryMode
      ? path.join(temporaryArtifactPath, 'index.html')
      : `${temporaryArtifactPath}.html`;

    try {
      if (directoryMode) {
        mkdirSync(temporaryArtifactPath, { recursive: true });
      }

      const writer = new ReportArtifactWriter(
        temporaryReportPath,
        directoryMode,
        'test',
        runnerDump.runId,
      );
      writer.initializeSync();
      const agentReports: ReportActionDump[] = [];
      for (const source of new Map(
        prepared.sources.map((source) => [source.reportId, source]),
      ).values()) {
        agentReports.push(source.dump);
        writer.addGroupSync(
          source.reportId,
          source.dump.serialize(),
          source.dumpPath ?? source.sourcePath,
          {
            'data-report-id': source.reportId,
            'data-runner-scope-id': source.scopeId,
          },
          source.imageOrigins,
        );
      }
      writer.finishSync(runnerDump, mergedAgentReportComment(agentReports));

      if (existsSync(finalArtifactPath)) {
        rmSync(finalArtifactPath, { recursive: true, force: true });
      }
      if (existsSync(standaloneReportPath)) {
        unlinkSync(standaloneReportPath);
      }
      renameSync(
        directoryMode ? temporaryArtifactPath : temporaryReportPath,
        directoryMode ? finalArtifactPath : standaloneReportPath,
      );
      rmSync(temporaryRoot, { recursive: true, force: true });
      return finalReportPath;
    } catch (error) {
      rmSync(temporaryRoot, { recursive: true, force: true });
      throw error;
    }
  }
}

export interface SplitReportHtmlOptions {
  htmlPath: string;
  outputDir: string;
}

export interface SplitReportHtmlResult {
  executionJsonFiles: string[];
  screenshotFiles: string[];
}

export interface CollectedReportExecutions {
  baseDump: ReportActionDump;
  executions: IExecutionDump[];
}

/**
 * Collect executions from a report HTML, deduplicating by stable id while
 * keeping only the latest occurrence. Old-format executions without id are
 * always preserved.
 */
export function collectDedupedExecutions(
  htmlPath: string,
): CollectedReportExecutions {
  let baseDump: ReportActionDump | null = null;
  let executionSerial = 0;
  const latestSerialByExecutionId = new Map<string, number>();

  streamReportDumpScripts(htmlPath, (dumpScript) => {
    if (!dumpScript.openTag.includes('data-group-id')) {
      return false;
    }
    const groupedDump = ReportActionDump.fromSerializedString(
      antiEscapeScriptTag(dumpScript.content),
    );
    for (const execution of groupedDump.executions) {
      executionSerial += 1;
      if (execution.id) {
        latestSerialByExecutionId.set(execution.id, executionSerial);
      }
    }
    return false;
  });

  const executions: IExecutionDump[] = [];
  executionSerial = 0;
  streamReportDumpScripts(htmlPath, (dumpScript) => {
    if (!dumpScript.openTag.includes('data-group-id')) {
      return false;
    }

    const groupedDump = ReportActionDump.fromSerializedString(
      antiEscapeScriptTag(dumpScript.content),
    );
    if (!baseDump) {
      baseDump = groupedDump;
    }

    for (const execution of groupedDump.executions) {
      executionSerial += 1;
      if (
        execution.id &&
        latestSerialByExecutionId.get(execution.id) !== executionSerial
      ) {
        continue;
      }
      executions.push(execution);
    }

    return false;
  });

  if (!baseDump) {
    throw new Error(`No report dump scripts found in ${htmlPath}`);
  }

  return {
    baseDump,
    executions,
  };
}

function externalizeImagesInExecution(
  execution: IExecutionDump,
  opts: {
    htmlPath: string;
    screenshotsDir: string;
    writtenFiles: Set<string>;
  },
): void {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (typeof node !== 'object' || node === null) return;

    const ref = normalizeStoredImageRef(node);
    if (ref) {
      const ext = imageRefFileExtension(ref);
      const fileName = `${ref.id}.${ext}`;
      const relativePath = `./screenshots/${fileName}`;
      const absolutePath = path.join(opts.screenshotsDir, fileName);

      if (!opts.writtenFiles.has(fileName)) {
        const resolved = resolveImageSource(ref, {
          reportPath: opts.htmlPath,
        });
        if (resolved.type === 'data-uri') {
          const { rawBase64 } = parseBase64ImageDataUrl(resolved.dataUri);
          writeFileSync(absolutePath, Buffer.from(rawBase64, 'base64'));
        } else {
          copyFileSync(resolved.filePath, absolutePath);
        }
        opts.writtenFiles.add(fileName);
      }

      ref.storage = 'file';
      ref.path = relativePath;
      return;
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  };

  visit(execution);
}

/**
 * Reverse parse a Midscene report HTML into per-execution JSON files and
 * externalized screenshots.
 */
export function splitReportHtmlByExecution(
  options: SplitReportHtmlOptions,
): SplitReportHtmlResult {
  const { htmlPath, outputDir } = options;
  const screenshotsDir = path.join(outputDir, 'screenshots');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });

  const executionJsonFiles: string[] = [];
  const writtenScreenshotFiles = new Set<string>();
  const { baseDump, executions } = collectDedupedExecutions(htmlPath);

  let fileIndex = 0;
  for (const execution of executions) {
    fileIndex += 1;
    externalizeImagesInExecution(execution, {
      htmlPath,
      screenshotsDir,
      writtenFiles: writtenScreenshotFiles,
    });
    const singleExecutionDump = new ReportActionDump({
      sdkVersion: baseDump.sdkVersion,
      groupName: baseDump.groupName,
      groupDescription: baseDump.groupDescription,
      modelBriefs: baseDump.modelBriefs,
      deviceType: baseDump.deviceType,
      executions: [execution],
    });

    const jsonFilePath = path.join(outputDir, `${fileIndex}.execution.json`);
    writeFileSync(jsonFilePath, singleExecutionDump.serialize(2), 'utf-8');
    executionJsonFiles.push(jsonFilePath);
  }

  return {
    executionJsonFiles,
    screenshotFiles: Array.from(writtenScreenshotFiles)
      .sort()
      .map((fileName) => path.join(screenshotsDir, fileName)),
  };
}
