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
  extractAllDumpScriptsSync,
  extractLastDumpScriptSync,
  extractTestRunReportDumpSync,
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
  parseBase64ImageDataUrl,
  resolveImageSource,
} from './dump/screenshot-store';
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
  // Directory-mode reports are always written as `{name}/index.html`, so any
  // other filename is inline. Short-circuit before touching the file so the
  // common inline case (`{name}.html`) costs nothing.
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
    const dump = extractLastDumpScriptSync(reportFilePath);
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
  private mergeDumpScripts(contents: string[]): string {
    const unescaped = contents
      .map((c) => antiEscapeScriptTag(c))
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
    opts?: {
      rmOriginalReports?: boolean;
      overwrite?: boolean;
      outputDir?: string;
    },
  ): string | null {
    const {
      rmOriginalReports = false,
      overwrite = false,
      outputDir,
    } = opts ?? {};

    if (this.reportInfos.length === 0) {
      logMsg('No reports to merge');
      return null;
    }

    const runnerDumps = this.reportInfos.map((info) =>
      info.reportFilePath
        ? extractTestRunReportDumpSync(info.reportFilePath)
        : undefined,
    );
    const hasRunnerDump = runnerDumps.some(Boolean);

    const targetDir = outputDir
      ? path.resolve(outputDir)
      : getMidsceneRunSubDir('report');
    if (outputDir) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Resolve each report's screenshot mode exactly once. isDirectoryModeReport
    // reads the file to find the authoritative metadata, so recomputing it for
    // both the output-path decision and the per-report merge loop would re-scan
    // every report twice.
    const isDirModeByIndex = this.reportInfos.map((info) =>
      Boolean(
        info.reportFilePath && isDirectoryModeReport(info.reportFilePath),
      ),
    );
    const hasDirectoryModeReport = isDirModeByIndex.some(Boolean);

    const resolvedName =
      reportFileName === 'AUTO'
        ? getReportFileName('merged-report')
        : reportFileName;

    // Directory mode: output as {name}/index.html to keep relative paths working
    // Inline mode: output as {name}.html (single file)
    const outputFilePath = hasDirectoryModeReport
      ? path.resolve(targetDir, resolvedName, 'index.html')
      : path.resolve(targetDir, `${resolvedName}.html`);

    if (reportFileName !== 'AUTO' && existsSync(outputFilePath)) {
      if (!overwrite) {
        throw new Error(
          `Report file already exists: ${outputFilePath}\nSet overwrite to true to overwrite this file.`,
        );
      }
      if (hasDirectoryModeReport) {
        rmSync(path.dirname(outputFilePath), { recursive: true, force: true });
      } else {
        unlinkSync(outputFilePath);
      }
    }

    if (hasDirectoryModeReport) {
      mkdirSync(path.dirname(outputFilePath), { recursive: true });
    }

    logMsg(
      `Start merging ${this.reportInfos.length} reports...\nCreating template file...`,
    );

    try {
      // Write template without closing </html> tag so we can append
      // dump scripts before it. The closing tag is added at the end.
      const htmlEndTag = '</html>';
      const tpl = getReportTpl();
      const htmlEndIdx = tpl.lastIndexOf(htmlEndTag);
      const tplWithoutClose =
        htmlEndIdx !== -1 ? tpl.slice(0, htmlEndIdx) : tpl;
      appendFileSync(outputFilePath, tplWithoutClose);

      // For directory-mode output, inject base URL fix script
      if (hasDirectoryModeReport) {
        appendFileSync(outputFilePath, getBaseUrlFixScript());
      }

      const agentReports: ReportActionDump[] = [];
      const runnerSources: MergeTestRunReportSource[] = [];
      const writtenInlineImageIds = new Set<string>();

      // Process all reports one by one
      for (let i = 0; i < this.reportInfos.length; i++) {
        const reportInfo = this.reportInfos[i];
        logMsg(`Processing report ${i + 1}/${this.reportInfos.length}`);

        const { reportAttributes } = reportInfo;
        let dumpString = this.createEmptyDumpString(
          reportAttributes.testTitle,
          reportAttributes.testDescription,
        );
        let mergedGroupId = `merged-group-${i}`;

        if (reportInfo.reportFilePath) {
          if (isDirModeByIndex[i]) {
            // Directory mode: copy external screenshot files. A directory-mode
            // report can legitimately have no screenshots/ dir (a run that
            // captured nothing), so only copy when the source dir exists.
            const reportDir = path.dirname(reportInfo.reportFilePath);
            const screenshotsDir = path.join(reportDir, 'screenshots');
            if (existsSync(screenshotsDir)) {
              const mergedScreenshotsDir = path.join(
                path.dirname(outputFilePath),
                'screenshots',
              );
              mkdirSync(mergedScreenshotsDir, { recursive: true });
              for (const file of readdirSync(screenshotsDir)) {
                const src = path.join(screenshotsDir, file);
                const dest = path.join(mergedScreenshotsDir, file);
                copyFileSync(src, dest);
              }
            }
          } else {
            // Inline mode: stream image scripts to output file
            streamImageScriptsToFile(
              reportInfo.reportFilePath,
              outputFilePath,
              writtenInlineImageIds,
            );
          }

          // Extract all dump scripts from the source report.
          // After the per-execution append refactor, a single source report
          // may contain multiple <script type="midscene_web_dump"> tags
          // (one per execution). We merge them into a single ReportActionDump.
          // Filter by data-group-id to exclude false matches from the template's
          // bundled JS code, which also references the midscene_web_dump type string.
          const allDumps = extractAllDumpScriptsSync(
            reportInfo.reportFilePath,
          ).filter((d) => d.openTag.includes('data-group-id'));
          const groupIdMatch = allDumps[0]?.openTag.match(
            /data-group-id="([^"]+)"/,
          );
          if (groupIdMatch && !hasRunnerDump) {
            mergedGroupId = decodeURIComponent(groupIdMatch[1]);
          }
          const extractedDumpString =
            allDumps.length > 0
              ? this.mergeDumpScripts(allDumps.map((d) => d.content))
              : extractLastDumpScriptSync(reportInfo.reportFilePath);
          if (extractedDumpString) {
            dumpString = extractedDumpString;
          }
        }

        const agentReport = tryParseAgentReportDump(dumpString);
        if (agentReport) {
          agentReports.push(agentReport);
        }
        if (hasRunnerDump)
          runnerSources.push({
            reportId: mergedGroupId,
            sourcePath: reportInfo.reportFilePath ?? '<skipped-agent-report>',
            attributes: reportAttributes,
            dump: runnerDumps[i],
            timing: agentReport
              ? agentReportTiming(agentReport, reportAttributes.testDuration)
              : undefined,
          });

        const reportHtmlStr = `${reportHTMLContent(
          {
            dumpString,
            attributes: {
              'data-group-id': mergedGroupId,
              ...(hasRunnerDump ? { 'data-report-id': mergedGroupId } : {}),
              [DATA_SCREENSHOT_MODE_ATTR]: hasDirectoryModeReport
                ? 'directory'
                : 'inline',
              playwright_test_duration: reportAttributes.testDuration,
              playwright_test_status: reportAttributes.testStatus,
              playwright_test_title: reportAttributes.testTitle,
              playwright_test_id: reportAttributes.testId,
              playwright_test_description: reportAttributes.testDescription,
              is_merged: true,
            },
          },
          undefined,
          undefined,
          false,
        )}\n`;

        appendFileSync(outputFilePath, reportHtmlStr);
      }

      if (hasRunnerDump) {
        const summary = collectReportSummary({
          executions: dedupeExecutionsKeepLatest(
            agentReports.flatMap((report) => report.executions),
          ),
        });
        appendFileSync(
          outputFilePath,
          runnerDumpScript(
            mergeTestRunReportDumps(
              runnerSources,
              {
                modelCallCount: summary.timing.modelCallCount,
                modelTimeMs: summary.timing.modelCallTimeMs,
                ...summary.tokens,
              },
              uuid(),
            ),
          ),
        );
      }

      const agentComment = mergedAgentReportComment(agentReports);
      if (agentComment) {
        appendFileSync(outputFilePath, agentComment);
      }

      // Close the HTML document
      appendFileSync(outputFilePath, `${htmlEndTag}\n`);

      logMsg(`Successfully merged new report: ${outputFilePath}`);

      // Remove original reports if needed
      if (rmOriginalReports) {
        let removedReportCount = 0;
        let reportCountWithFilePath = 0;
        for (const info of this.reportInfos) {
          if (!info.reportFilePath) continue;
          reportCountWithFilePath += 1;
          try {
            removeReportArtifact(info.reportFilePath);
            removedReportCount += 1;
          } catch (error) {
            logMsg(`Error deleting report ${info.reportFilePath}: ${error}`);
          }
        }
        logMsg(
          `Removed ${removedReportCount}/${reportCountWithFilePath} original reports`,
        );
      }
      return outputFilePath;
    } catch (error) {
      logMsg(`Error in mergeReports: ${error}`);
      throw error;
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
  directoryMode: boolean;
  dumpPath?: string;
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
  loadedDumps?: ReadonlyMap<string, string>,
): {
  sources: PreparedTestRunReportSource[];
  metrics: TestRunReportMetrics;
} => {
  const prepared: PreparedTestRunReportSource[] = [];
  const ownerByScopedExecution = new Map<string, string>();
  const preparedByPath = new Map<string, PreparedTestRunReportSource>();

  for (const [sourceIndex, source] of uniqueTestRunReportSources(
    sources,
  ).entries()) {
    // A borrowed Agent can serve several sequential test scopes. Reuse its
    // report group and metrics while indexing each scope's execution links.
    const sourceKey = source.sourcePath;
    const shared = preparedByPath.get(sourceKey);
    if (shared) {
      if (source.dumpPath) {
        const snapshot = ReportActionDump.fromSerializedString(
          loadedDumps?.get(source.dumpPath) ??
            readFileSync(source.dumpPath, 'utf8'),
        );
        shared.dump.executions = dedupeExecutionsKeepLatest([
          ...shared.dump.executions,
          ...snapshot.executions,
        ]);
        shared.executionIds.splice(
          0,
          shared.executionIds.length,
          ...shared.dump.executions.flatMap((execution) =>
            execution.id ? [execution.id] : [],
          ),
        );
      }
      for (const executionId of shared.executionIds) {
        const key = `${source.scopeId}\u0000${executionId}`;
        const owner = ownerByScopedExecution.get(key);
        if (owner && owner !== shared.reportId)
          throw new Error(
            `Agent execution ${executionId} is present in multiple reports for test scope ${source.scopeId}: ${owner}, ${shared.reportId}`,
          );
        ownerByScopedExecution.set(key, shared.reportId);
      }
      prepared.push({ ...shared, scopeId: source.scopeId });
      continue;
    }
    if (!source.dumpPath && !existsSync(source.sourcePath)) {
      throw new Error(`Agent report does not exist: ${source.sourcePath}`);
    }

    const sourceVersion = source.dumpPath
      ? undefined
      : peekReportSdkVersion(source.sourcePath);
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

    const reportId = `runner-report-${sourceIndex + 1}`;
    const snapshot = source.dumpPath
      ? ReportActionDump.fromSerializedString(
          loadedDumps?.get(source.dumpPath) ??
            readFileSync(source.dumpPath, 'utf8'),
        )
      : undefined;
    const { baseDump, executions } = snapshot
      ? { baseDump: snapshot, executions: snapshot.executions }
      : collectDedupedExecutions(source.sourcePath);
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
      dump,
      directoryMode:
        !!source.dumpPath || isDirectoryModeReport(source.sourcePath),
      ...(source.dumpPath ? { dumpPath: source.dumpPath } : {}),
    };
    prepared.push(preparedSource);
    preparedByPath.set(sourceKey, preparedSource);
  }

  // A legacy invocation can preserve a snapshot of an Agent also used by
  // native scopes. Count stable executions once across both paths.
  const summary = collectReportSummary({
    executions: dedupeExecutionsKeepLatest(
      [...preparedByPath.values()].flatMap((source) => source.dump.executions),
    ),
  });
  return {
    sources: prepared,
    metrics: {
      modelCallCount: summary.timing.modelCallCount,
      modelTimeMs: summary.timing.modelCallTimeMs,
      ...summary.tokens,
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
    const loaded = new Map<string, string>();
    await Promise.all(
      options.sources.map(async (source) => {
        if (source.dumpPath)
          loaded.set(
            source.dumpPath,
            await fsAsync.readFile(source.dumpPath, 'utf8'),
          );
      }),
    );
    const prepared = prepareTestRunReportSources(options.sources, loaded);
    const dump = options.buildRunnerDump({
      sources: prepared.sources,
      metrics: prepared.metrics,
    });
    if (dump.kind !== 'test-runner' || dump.schemaVersion !== 1)
      throw new Error('Invalid Runner report dump');
    const directoryMode = prepared.sources.some(
      (source) => source.directoryMode,
    );
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
      const parts = [
        getReportTpl(),
        directoryMode ? getBaseUrlFixScript() : '',
      ];
      const imageIds = new Set<string>();
      const reports: ReportActionDump[] = [];
      for (const source of new Map(
        prepared.sources.map((source) => [source.reportId, source]),
      ).values()) {
        const serialized = source.dump.serialize();
        if (source.dumpPath) {
          const refs = new Map<
            string,
            ReturnType<typeof normalizeStoredImageRef> & {}
          >();
          JSON.parse(serialized, (_key, value) => {
            const ref = normalizeStoredImageRef(value);
            if (ref) refs.set(ref.id, ref);
            return value;
          });
          if (refs.size)
            await fsAsync.mkdir(path.join(temporary, 'screenshots'), {
              recursive: true,
            });
          for (const ref of refs.values()) {
            if (imageIds.has(ref.id)) continue;
            if (ref.storage !== 'file' || !ref.path)
              throw new Error(`Snapshot image ${ref.id} has no file source`);
            await fsAsync.copyFile(
              path.resolve(path.dirname(source.dumpPath), ref.path),
              path.join(
                temporary,
                'screenshots',
                `${ref.id}.${imageRefFileExtension(ref)}`,
              ),
            );
            imageIds.add(ref.id);
          }
        } else {
          // An explicit external provider may still return a finalized HTML artifact.
          // This is a public provider contract, not a second execution/serialization schema.
          if (source.directoryMode) {
            const images = path.join(
              path.dirname(source.sourcePath),
              'screenshots',
            );
            if (existsSync(images))
              await fsAsync.cp(images, path.join(temporary, 'screenshots'), {
                recursive: true,
              });
          } else {
            const html = await fsAsync.readFile(source.sourcePath, 'utf8');
            for (const match of html.matchAll(
              /<script\b([^>]*)>[\s\S]*?<\/script>/g,
            )) {
              if (/(?:^|\s)type=["']midscene-image["']/.test(match[1]))
                parts.push(match[0]);
            }
          }
        }
        reports.push(source.dump);
        parts.push(
          reportHTMLContent(
            {
              dumpString: serialized,
              attributes: {
                'data-group-id': source.reportId,
                'data-report-id': source.reportId,
                'data-runner-scope-id': source.scopeId,
                [DATA_SCREENSHOT_MODE_ATTR]: directoryMode
                  ? 'directory'
                  : 'inline',
              },
            },
            undefined,
            undefined,
            false,
          ),
        );
      }
      parts.push(runnerDumpScript(dump), mergedAgentReportComment(reports));
      await fsAsync.writeFile(htmlPath, parts.join('\n'));
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
        ({ reportId, scopeId, sourcePath, executionIds }) => ({
          reportId,
          scopeId,
          sourcePath,
          executionIds,
        }),
      ),
      metrics: prepared.metrics,
    };
    const runnerDump = options.buildRunnerDump(index);
    if (runnerDump.schemaVersion !== 1 || runnerDump.kind !== 'test-runner') {
      throw new Error(
        'buildRunnerDump must return a Midscene Test report dump with schemaVersion 1 and kind "test-runner".',
      );
    }
    // Validate serializability before creating any output artifact.
    JSON.stringify(runnerDump);

    const directoryMode = prepared.sources.some(
      (source) => source.directoryMode,
    );
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

      const htmlEndTag = '</html>';
      const template = getReportTpl();
      const htmlEndIndex = template.lastIndexOf(htmlEndTag);
      appendFileSync(
        temporaryReportPath,
        htmlEndIndex === -1 ? template : template.slice(0, htmlEndIndex),
      );
      if (directoryMode) {
        appendFileSync(temporaryReportPath, getBaseUrlFixScript());
      }

      const agentReports: ReportActionDump[] = [];
      for (const source of new Map(
        prepared.sources.map((source) => [source.reportId, source]),
      ).values()) {
        if (source.directoryMode) {
          const screenshotsDir = path.join(
            path.dirname(source.sourcePath),
            'screenshots',
          );
          if (existsSync(screenshotsDir)) {
            const targetScreenshotsDir = path.join(
              path.dirname(temporaryReportPath),
              'screenshots',
            );
            mkdirSync(targetScreenshotsDir, { recursive: true });
            for (const file of readdirSync(screenshotsDir)) {
              copyFileSync(
                path.join(screenshotsDir, file),
                path.join(targetScreenshotsDir, file),
              );
            }
          }
        } else {
          streamImageScriptsToFile(source.sourcePath, temporaryReportPath);
        }

        agentReports.push(source.dump);
        appendFileSync(
          temporaryReportPath,
          `${reportHTMLContent(
            {
              dumpString: source.dump.serialize(),
              attributes: {
                'data-group-id': source.reportId,
                'data-report-id': source.reportId,
                'data-runner-scope-id': source.scopeId,
                [DATA_SCREENSHOT_MODE_ATTR]: directoryMode
                  ? 'directory'
                  : 'inline',
              },
            },
            undefined,
            undefined,
            false,
          )}\n`,
        );
      }

      appendFileSync(temporaryReportPath, runnerDumpScript(runnerDump));
      const agentComment = mergedAgentReportComment(agentReports);
      if (agentComment) {
        appendFileSync(temporaryReportPath, agentComment);
      }
      appendFileSync(temporaryReportPath, `${htmlEndTag}\n`);

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

  streamDumpScriptsSync(htmlPath, (dumpScript) => {
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
  streamDumpScriptsSync(htmlPath, (dumpScript) => {
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
