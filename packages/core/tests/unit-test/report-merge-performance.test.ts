import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('report merge performance regression', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `midscene-report-merge-perf-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    vi.doUnmock('node:fs');
    vi.resetModules();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should scan each inline report only once while merging', async () => {
    const openSyncCalls = vi.fn();

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();

      return {
        ...actual,
        openSync: vi.fn((...args: Parameters<typeof actual.openSync>) => {
          openSyncCalls(...args);
          return actual.openSync(...args);
        }),
      };
    });

    const { ReportMergingTool } = await import('../../src/report');
    const { generateDumpScriptTag, generateImageScriptTag } = await import(
      '../../src/dump/html-utils'
    );

    const tool = new ReportMergingTool();
    const reportPaths: string[] = [];
    const reportsToMerge = 2;
    const imagesPerReport = 30;

    for (let reportIndex = 0; reportIndex < reportsToMerge; reportIndex++) {
      const reportPath = join(tmpDir, `inline-report-${reportIndex}.html`);
      const imageScripts = Array.from(
        { length: imagesPerReport },
        (_, imageIndex) =>
          generateImageScriptTag(
            `img-${reportIndex}-${imageIndex}`,
            `data:image/png;base64,${'A'.repeat(8 * 1024)}`,
          ),
      ).join('\n');
      const dumpScript = generateDumpScriptTag(
        JSON.stringify({
          groupName: `group-${reportIndex}`,
          executions: [],
        }),
      );

      writeFileSync(
        reportPath,
        `<!doctype html>\n${imageScripts}\n${dumpScript}`,
      );
      reportPaths.push(reportPath);

      tool.append({
        reportFilePath: reportPath,
        reportAttributes: {
          testDescription: `desc-${reportIndex}`,
          testDuration: 1000,
          testId: `id-${reportIndex}`,
          testStatus: 'passed',
          testTitle: `title-${reportIndex}`,
        },
      });
    }

    const mergedPath = tool.mergeReports('inline-report-single-pass-scan', {
      overwrite: true,
    });

    expect(existsSync(mergedPath!)).toBe(true);

    const mergedContent = readFileSync(mergedPath!, 'utf-8');
    expect(mergedContent).toContain('data-id="img-0-0"');
    expect(mergedContent).toContain('data-id="img-1-29"');
    expect(mergedContent).toContain('playwright_test_title="title-0"');
    expect(mergedContent).toContain('playwright_test_title="title-1"');

    const openCountsBySource = new Map(
      reportPaths.map((reportPath) => [
        reportPath,
        openSyncCalls.mock.calls.filter(([filePath]) => filePath === reportPath)
          .length,
      ]),
    );

    expect(openCountsBySource.get(reportPaths[0])).toBe(1);
    expect(openCountsBySource.get(reportPaths[1])).toBe(1);
  });
});
