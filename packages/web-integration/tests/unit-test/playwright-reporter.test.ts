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
import * as agentActual from '@midscene/core/agent' with {
  rstest: 'importActual',
};
import { ReportMergingTool } from '@midscene/core/report';
import * as sharedUtils from '@midscene/shared/utils';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/shared/common', () => ({
  getMidsceneRunSubDir: rs.fn(),
}));

rs.mock('@midscene/core/agent', () => ({
  ...agentActual,
  printReportMsg: rs.fn(),
}));

describe('MidsceneReporter', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    rs.clearAllMocks();
    rs.spyOn(sharedUtils, 'logMsg').mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), 'midscene-test-'));
    outputDir = join(tempDir, 'output');

    const { getMidsceneRunSubDir } = await import('@midscene/shared/common');
    rs.mocked(getMidsceneRunSubDir).mockReturnValue(outputDir);
  });

  afterEach(() => {
    rs.restoreAllMocks();
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
      const mergeSpy = rs.spyOn<any, any>(
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

    it('should keep reports distinct when tests in different suites share a title', async () => {
      const reporter = new MidsceneReporter({ type: 'separate' });
      const reportPathA = createReportFile('same-title-suite-a', 'suite-a');
      const reportPathB = createReportFile('same-title-suite-b', 'suite-b');

      for (const [id, suiteTitle, reportPath] of [
        ['test-id-suite-a', 'suite a', reportPathA],
        ['test-id-suite-b', 'suite b', reportPathB],
      ]) {
        reporter.onTestEnd(
          {
            id,
            title: 'same leaf title',
            parent: { title: suiteTitle },
            annotations: [
              { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPath },
            ],
          } as unknown as TestCase,
          { status: 'passed', duration: 50 } as TestResult,
        );
      }

      await reporter.onEnd();

      const outputFiles = readdirSync(outputDir).filter((fileName) =>
        fileName.endsWith('.html'),
      );
      expect(outputFiles).toHaveLength(2);
      expect(
        outputFiles.map((fileName) =>
          readFileSync(join(outputDir, fileName), 'utf-8'),
        ),
      ).toEqual(expect.arrayContaining(['suite-a', 'suite-b']));
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
      rs.spyOn(
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

    it.each([
      ['single-html', '.html'],
      ['html-and-external-assets', ''],
    ] as const)(
      'should keep separate-mode %s output names within the filesystem byte limit',
      async (outputFormat, expectedExtension) => {
        const reporter = new MidsceneReporter({
          type: 'separate',
          outputFormat,
        });
        const reportPath = createReportFile(
          `long-title-report-${outputFormat}`,
          'long-title-data',
        );
        const longTitle =
          '1426803-【配置-策略模板配置】【创建策略模板】策略模板名称与当前存在的名称重复'.repeat(
            10,
          );

        reporter.onTestEnd(
          {
            id: `test-id-${outputFormat}`,
            title: longTitle,
            annotations: [
              { type: 'MIDSCENE_DUMP_ANNOTATION', description: reportPath },
            ],
          } as TestCase,
          { status: 'passed', duration: 50 } as TestResult,
        );

        await reporter.onEnd();

        const [outputName] = readdirSync(outputDir);
        expect(Buffer.byteLength(outputName, 'utf8')).toBeLessThanOrEqual(255);
        expect(outputName.endsWith(expectedExtension)).toBe(true);
        expect(outputName).toMatch(/^playwright-.+-[0-9a-f]{10}-\d{4}-/);
      },
    );

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
