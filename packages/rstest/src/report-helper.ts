import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { TestStatus } from '@midscene/core';
import { ReportMergingTool } from '@midscene/core/report';
import { MANIFEST_DIR, generateTimestamp, manifestKey } from './utils';

export interface RstestTestContext {
  task: {
    id: string;
    name: string;
    result?: {
      status: 'pass' | 'fail' | 'skip' | 'todo';
      errors?: Array<{ message?: string }>;
    };
  };
}

export interface AgentLike {
  reportFile?: string | null;
  destroy(): Promise<void>;
}

const STATUS_MAP: Record<string, TestStatus> = {
  pass: 'passed',
  fail: 'failed',
};

function deriveStatus(result: RstestTestContext['task']['result']): TestStatus {
  // TODO: rstest may eventually surface a structured timeout flag — until then
  // we substring-match the error message the way Vitest does.
  if (result?.errors?.[0]?.message?.includes('timed out')) return 'timedOut';
  return STATUS_MAP[result?.status ?? ''] ?? 'passed';
}

export class ReportHelper {
  private reportTool = new ReportMergingTool();
  private firstReport: string | null = null;

  reset(): void {
    this.reportTool = new ReportMergingTool();
    this.firstReport = null;
  }

  async collectReport(
    agent: AgentLike | undefined,
    startTime: number | undefined,
    testCtx: RstestTestContext,
  ): Promise<void> {
    const status = deriveStatus(testCtx.task.result);

    await agent?.destroy();

    const reportFile = agent?.reportFile;
    if (!reportFile) return;

    this.reportTool.append({
      reportFilePath: reportFile,
      reportAttributes: {
        testId: testCtx.task.id,
        testTitle: testCtx.task.name,
        testDescription: '',
        testDuration:
          startTime !== undefined
            ? Math.round(performance.now() - startTime)
            : 0,
        testStatus: status,
      },
    });
    this.firstReport ??= reportFile;
  }

  mergeReports(filepath: string): string | null {
    const base = basename(filepath, extname(filepath)) || 'MergedReport';
    const finalReportName = `E2E-${base}-${generateTimestamp()}`;

    const merged = this.reportTool.mergeReports(finalReportName);
    const report = merged ?? this.firstReport;

    if (report) {
      mkdirSync(MANIFEST_DIR, { recursive: true });
      writeFileSync(join(MANIFEST_DIR, `${manifestKey(filepath)}.txt`), report);
    }

    this.firstReport = null;
    return merged;
  }
}

/**
 * Rstest doesn't expose the surrounding `describe` name in the test context,
 * so we derive `groupName` from the file basename.
 */
export function buildReportMeta(
  testCtx: RstestTestContext,
  filepath: string,
): { groupName: string; reportFileName: string } {
  const base = basename(filepath, extname(filepath)) || 'UnnamedGroup';
  const taskName = testCtx.task.name;
  return {
    groupName: `E2E: ${base}`,
    reportFileName: `E2E-${base}-${taskName}-${generateTimestamp()}`,
  };
}

export { deriveStatus };
