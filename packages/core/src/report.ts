import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { antiEscapeScriptTag, logMsg } from '@midscene/shared/utils';
import { getReportFileName } from './agent';
import {
  DATA_SCREENSHOT_MODE_ATTR,
  extractAllDumpScriptsSync,
  extractLastDumpScriptSync,
  getBaseUrlFixScript,
  streamDumpScriptsSync,
  streamImageScriptsToFile,
} from './dump/html-utils';
import {
  normalizeScreenshotRef,
  resolveScreenshotSource,
} from './dump/screenshot-store';
import {
  type ExecutionDump,
  type IExecutionDump,
  ReportActionDump,
  type ScreenshotMode,
} from './types';
import type { ReportFileWithAttributes } from './types';
import { getReportTpl, getVersion, reportHTMLContent } from './utils';

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
            streamImageScriptsToFile(reportInfo.reportFilePath, outputFilePath);
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
          if (groupIdMatch) {
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

        const reportHtmlStr = `${reportHTMLContent(
          {
            dumpString,
            attributes: {
              'data-group-id': mergedGroupId,
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

      // Close the HTML document
      appendFileSync(outputFilePath, `${htmlEndTag}\n`);

      logMsg(`Successfully merged new report: ${outputFilePath}`);

      // Remove original reports if needed
      if (rmOriginalReports) {
        for (const info of this.reportInfos) {
          if (!info.reportFilePath) continue;
          try {
            if (isDirectoryBasedReport(info.reportFilePath)) {
              // The report owns its directory (`{name}/index.html`) — remove the
              // whole folder, whether screenshots are external or inlined.
              const reportDir = path.dirname(info.reportFilePath);
              rmSync(reportDir, { recursive: true, force: true });
            } else {
              unlinkSync(info.reportFilePath);
            }
          } catch (error) {
            logMsg(`Error deleting report ${info.reportFilePath}: ${error}`);
          }
        }
        logMsg(`Removed ${this.reportInfos.length} original reports`);
      }
      return outputFilePath;
    } catch (error) {
      logMsg(`Error in mergeReports: ${error}`);
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

function extensionByMimeType(mimeType: string): 'png' | 'jpeg' {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpeg';
  throw new Error(`Unsupported screenshot mime type: ${mimeType}`);
}

function externalizeScreenshotsInExecution(
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

    const ref = normalizeScreenshotRef(node);
    if (ref) {
      const ext = extensionByMimeType(ref.mimeType);
      const fileName = `${ref.id}.${ext}`;
      const relativePath = `./screenshots/${fileName}`;
      const absolutePath = path.join(opts.screenshotsDir, fileName);

      if (!opts.writtenFiles.has(fileName)) {
        const resolved = resolveScreenshotSource(ref, {
          reportPath: opts.htmlPath,
        });
        if (resolved.type === 'data-uri') {
          const rawBase64 = resolved.dataUri.replace(
            /^data:image\/[a-zA-Z+]+;base64,/,
            '',
          );
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
    externalizeScreenshotsInExecution(execution, {
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
