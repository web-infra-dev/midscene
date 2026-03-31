import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MidsceneReporter from '@/playwright/reporter';
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
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createReportFile(name: string, content = 'report-data'): string {
    const reportPath = join(tempDir, `${name}.html`);
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
        } as TestCase,
        { status: 'passed', duration: 1 } as TestResult,
      );
      await reporter.onEnd();

      expect(mergeSpy).toHaveBeenCalledTimes(1);
      expect(readdirSync(outputDir)).toEqual([]);
    });

    it('should copy a single report file in merged mode', async () => {
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

      const [mergedFileName] = readdirSync(outputDir).filter((fileName) =>
        fileName.endsWith('.html'),
      );
      const mergedPath = join(outputDir, mergedFileName);
      expect(existsSync(mergedPath)).toBe(true);
      expect(readFileSync(mergedPath, 'utf-8')).toBe('single-report-data');
    });

    it('should merge multiple reports in merged mode', async () => {
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
      expect(outputEntries.length).toBeGreaterThan(0);
    });

    it('should copy a single report file in separate mode', async () => {
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

      expect(readdirSync(outputDir).length).toBeGreaterThan(0);
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
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

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

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read Midscene report file'),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
