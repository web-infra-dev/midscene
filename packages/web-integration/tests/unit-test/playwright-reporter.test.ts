import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MidsceneReporter from '@/playwright/reporter';
import { ReportMergingTool } from '@midscene/core/report';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/common', () => ({
  getMidsceneRunSubDir: vi.fn(),
}));

vi.mock('@midscene/core/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@midscene/core/agent')>();
  return {
    ...actual,
    printReportMsg: vi.fn(),
  };
});

vi.mock('@midscene/shared/utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@midscene/shared/utils')>();
  return {
    ...actual,
    logMsg: vi.fn(),
  };
});

describe('MidsceneReporter', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'midscene-test-'));
    outputDir = join(tempDir, 'output');

    const { getMidsceneRunSubDir } = await import('@midscene/shared/common');
    vi.mocked(getMidsceneRunSubDir).mockReturnValue(outputDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createReportFile(name: string, content = 'report-data'): string {
    mkdirSync(outputDir, { recursive: true });
    const reportPath = join(outputDir, `${name}.html`);
    writeFileSync(reportPath, content, 'utf-8');
    return reportPath;
  }

  describe('constructor', () => {
    it('should set mode to separate when type option is provided', () => {
      const reporter = new MidsceneReporter({ type: 'separate' });
      expect(reporter.mode).toBe('separate');
    });

    it('should set mode to merged when type option is provided', () => {
      const reporter = new MidsceneReporter({ type: 'merged' });
      expect(reporter.mode).toBe('merged');
    });

    it('should default to merged mode when no options are provided', () => {
      const reporter = new MidsceneReporter();
      expect(reporter.mode).toBe('merged');
    });

    it('should throw error for invalid type', () => {
      expect(() => {
        new MidsceneReporter({ type: 'invalid' as never });
      }).toThrow(
        "Unknown reporter type in playwright config: invalid, only support 'merged' or 'separate'",
      );
    });
  });

  describe('report collection', () => {
    it('should ignore tests without Midscene annotations', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });
      const mergeSpy = vi.spyOn<any, any>(
        reporter as any,
        'finalizeMergedReport',
      );

      reporter.onTestEnd(
        {
          id: 'test-id-0',
          title: 'No Report',
          annotations: [],
        } as unknown as TestCase,
        { status: 'passed', duration: 1 } as TestResult,
      );
      await reporter.onEnd();

      expect(mergeSpy).toHaveBeenCalledTimes(1);
      expect(readdirSync(outputDir)).toEqual([]);
    });

    it('should finalize a single report in merged mode and remove the source', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });
      const reportPath = createReportFile(
        'single-report',
        'single-report-data',
      );

      reporter.onTestEnd(
        {
          id: 'test-id-1',
          title: 'My Test Case',
          annotations: [
            { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPath },
          ],
        } as TestCase,
        { status: 'passed', duration: 123 } as TestResult,
      );

      await reporter.onEnd();

      const reportFiles = readdirSync(outputDir).filter((fileName) =>
        fileName.endsWith('.html'),
      );
      expect(reportFiles).toHaveLength(1);
      const [mergedFileName] = reportFiles;
      const mergedPath = join(outputDir, mergedFileName);
      expect(existsSync(mergedPath)).toBe(true);
      expect(readFileSync(mergedPath, 'utf-8')).toBe('single-report-data');
      expect(existsSync(reportPath)).toBe(false);
    });

    it('should merge multiple reports in merged mode and remove the sources', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });
      const reportPathA = createReportFile(
        'report-a',
        '<!doctype html><html><body><script type="midscene_web_dump" data-group-id="a">{"groupName":"a","executions":[]}</script></body></html>',
      );
      const reportPathB = createReportFile(
        'report-b',
        '<!doctype html><html><body><script type="midscene_web_dump" data-group-id="b">{"groupName":"b","executions":[]}</script></body></html>',
      );

      reporter.onTestEnd(
        {
          id: 'test-id-2',
          title: 'First Test',
          annotations: [
            { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPathA },
          ],
        } as TestCase,
        { status: 'passed', duration: 100 } as TestResult,
      );
      reporter.onTestEnd(
        {
          id: 'test-id-3',
          title: 'Second Test',
          annotations: [
            { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPathB },
          ],
        } as TestCase,
        { status: 'failed', duration: 200 } as TestResult,
      );

      await reporter.onEnd();

      const outputEntries = readdirSync(outputDir);
      expect(outputEntries).toHaveLength(1);
      expect(existsSync(reportPathA)).toBe(false);
      expect(existsSync(reportPathB)).toBe(false);
    });

    it('should finalize a single report in separate mode and remove the source', async () => {
      const reporter = new MidsceneReporter({ type: 'separate' });
      const reportPath = createReportFile('separate-report', 'separate-data');

      reporter.onTestEnd(
        {
          id: 'test-id-4',
          title: 'Separate Test',
          annotations: [
            { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPath },
          ],
        } as TestCase,
        { status: 'passed', duration: 50 } as TestResult,
      );

      await reporter.onEnd();

      expect(readdirSync(outputDir)).toHaveLength(1);
      expect(existsSync(reportPath)).toBe(false);
    });

    it('should merge multiple page reports in separate mode and remove the sources', async () => {
      const reporter = new MidsceneReporter({ type: 'separate' });
      const reportPathA = createReportFile(
        'separate-page-a',
        '<!doctype html><html><body><script type="midscene_web_dump" data-group-id="a">{"groupName":"a","executions":[]}</script></body></html>',
      );
      const reportPathB = createReportFile(
        'separate-page-b',
        '<!doctype html><html><body><script type="midscene_web_dump" data-group-id="b">{"groupName":"b","executions":[]}</script></body></html>',
      );

      reporter.onTestEnd(
        {
          id: 'test-id-multi-page',
          title: 'Separate Multi Page Test',
          annotations: [
            { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPathA },
            { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPathB },
          ],
        } as TestCase,
        { status: 'passed', duration: 50 } as TestResult,
      );

      await reporter.onEnd();

      expect(readdirSync(outputDir)).toHaveLength(1);
      expect(existsSync(reportPathA)).toBe(false);
      expect(existsSync(reportPathB)).toBe(false);
    });

    it('should remove the whole source directory after copying a directory-based report', async () => {
      const reporter = new MidsceneReporter({
        type: 'merged',
        outputFormat: 'html-and-external-assets',
      });
      const sourceDir = join(outputDir, 'directory-report');
      const reportPath = join(sourceDir, 'index.html');
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(reportPath, 'directory-report-data', 'utf-8');

      reporter.onTestEnd(
        {
          id: 'test-id-directory',
          title: 'Directory Report Test',
          annotations: [
            { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPath },
          ],
        } as TestCase,
        { status: 'passed', duration: 50 } as TestResult,
      );

      await reporter.onEnd();

      const outputEntries = readdirSync(outputDir);
      expect(outputEntries).toHaveLength(1);
      const [finalReportDir] = outputEntries;
      expect(existsSync(join(outputDir, finalReportDir, 'index.html'))).toBe(
        true,
      );
      expect(existsSync(sourceDir)).toBe(false);
    });

    it('should preserve source reports when final report generation fails', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });
      const reportPathA = createReportFile('failed-merge-source-a');
      const reportPathB = createReportFile('failed-merge-source-b');
      vi.spyOn(
        ReportMergingTool.prototype,
        'mergeReports',
      ).mockImplementationOnce(() => {
        throw new Error('merge failed');
      });

      for (const [id, reportPath] of [
        ['a', reportPathA],
        ['b', reportPathB],
      ]) {
        reporter.onTestEnd(
          {
            id: `test-id-failed-${id}`,
            title: `Failed ${id}`,
            annotations: [
              { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPath },
            ],
          } as TestCase,
          { status: 'failed', duration: 50 } as TestResult,
        );
      }

      await expect(reporter.onEnd()).rejects.toThrow('merge failed');
      expect(existsSync(reportPathA)).toBe(true);
      expect(existsSync(reportPathB)).toBe(true);
    });

    it('should include project name and retry in collected test title', async () => {
      const reporter = new MidsceneReporter({ type: 'separate' });
      await reporter.onBegin(
        {
          projects: [{ name: 'chromium' }, { name: 'webkit' }],
        } as any,
        {} as any,
      );
      const reportPath = createReportFile('project-report', 'project-data');

      reporter.onTestEnd(
        {
          id: 'test-id-5',
          title: 'Project Test',
          parent: {
            project: () => ({ name: 'webkit' }),
            title: 'suite',
          },
          annotations: [
            { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPath },
          ],
        } as TestCase,
        { status: 'passed', duration: 50, retry: 2 } as TestResult,
      );

      await reporter.onEnd();

      expect(readdirSync(outputDir).length).toBeGreaterThan(0);
    });

    it('should log and skip missing report paths', async () => {
      const reporter = new MidsceneReporter({ type: 'merged' });
      const { logMsg } = await import('@midscene/shared/utils');

      reporter.onTestEnd(
        {
          id: 'test-id-missing',
          title: 'Missing Report',
          annotations: [
            {
              type: 'MIDSCENE_DUMP_ANNOTATION',
              description: join(tempDir, 'missing.html'),
            },
          ],
        } as TestCase,
        { status: 'passed', duration: 10 } as TestResult,
      );

      await reporter.onEnd();

      expect(logMsg).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read Midscene report file'),
        expect.any(Error),
      );
    });
  });
});
