import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-ignore no types in es folder
import { ReportMergingTool } from '../../dist/es/report';
// @ts-ignore no types in es folder
import { writeDumpReport } from '../../dist/es/utils';
import { getTmpFile } from '../../src/utils';

function generateNReports(
  n: number,
  c: string,
  t: ReportMergingTool,
  withExpectedContent = true,
) {
  const expectedContents = [];
  for (let i = 0; i < n; i++) {
    const content = `${c} ${i}`;
    if (withExpectedContent) expectedContents.push(content);
    const reportPath = writeDumpReport(`report-to-merge-${i}`, {
      dumpString: content,
    });
    t.append({
      reportFilePath: reportPath,
      reportAttributes: {
        testDescription: `desc${i}`,
        testDuration: 1,
        testId: `${i}`,
        testStatus: 'passed',
        testTitle: `${i}`,
      },
    });
  }
  return expectedContents;
}

describe('reportMergingTool', () => {
  it('should merge 3 mocked reports', async () => {
    const tool = new ReportMergingTool();
    const expectedContents = generateNReports(3, 'report content', tool);
    // execute merge operation
    const mergedReportPath = tool.mergeReports();
    // assert merge success
    const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
    expectedContents.forEach((content) => {
      expect(mergedReportContent).contains(content);
    });
  });

  it('should merge 3 mocked reports, and delete original reports after that.', async () => {
    const tool = new ReportMergingTool();
    const expectedContents = generateNReports(
      3,
      'report content, original report file deleted',
      tool,
    );
    // assert merge success
    const mergedReportPath = tool.mergeReports(undefined, {
      rmOriginalReports: true,
      overwrite: true,
    });
    const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
    expectedContents.forEach((content) => {
      expect(mergedReportContent).contains(content);
    });
    // assert source report files deleted successfully
    tool.reportInfos.forEach((el: any) => {
      expect(existsSync(el.reportFilePath)).toBe(false);
    });
  });

  it('should merge 3 mocked reports, use user custom filename', async () => {
    const tool = new ReportMergingTool();
    const expectedContents = generateNReports(3, 'report content', tool);
    // assert merge success
    const mergedReportPath = tool.mergeReports(
      'my-custom-merged-report-filename',
      {
        overwrite: true,
      },
    );
    const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
    expectedContents.forEach((content) => {
      expect(mergedReportContent).contains(content);
    });
  });

  it('should merge 3 mocked reports twice, use user custom filename, overwrite old report on second merge', async () => {
    const tool = new ReportMergingTool();
    // first reports
    generateNReports(3, 'report content', tool);
    // assert merge success
    tool.mergeReports('my-custom-merged-report-filename-overwrite', {
      overwrite: true,
    });
    tool.clear();
    // second reports
    const expectedContents = generateNReports(3, 'new report content', tool);
    // assert merge success
    const mergedReportPath = tool.mergeReports(
      'my-custom-merged-report-filename-overwrite',
      { overwrite: true },
    );
    const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
    expectedContents.forEach((content) => {
      expect(mergedReportContent).contains(content);
    });
  });

  it('should extract content from <script> tag in large HTML', async () => {
    const tool = new ReportMergingTool();
    // create 3M html temp file
    const hugeContent = Buffer.alloc(3 * 1024 * 1024 - 200, 'a').toString();
    const largeHtmlPath = getTmpFile('html');
    if (!largeHtmlPath) {
      throw new Error('Failed to create temp html file');
    }
    writeFileSync(
      largeHtmlPath,
      `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
${hugeContent}
<script type="midscene_web_dump" type="application/json">
test
</script>
</body>
</html>
`,
      'utf8',
    );
    const result = await tool.extractScriptContent(largeHtmlPath);
    unlinkSync(largeHtmlPath); // remove temp file
    expect(result).toBe('test');
  });

  it(
    'should merge 100 mocked reports, and delete original reports after that.',
    { timeout: 5 * 60 * 1000 },
    async () => {
      const tool = new ReportMergingTool();

      console.time('generate 100 mocked report files.');
      const hugeContent = Buffer.alloc(50 * 1024 * 1024, 'a').toString();
      generateNReports(
        100,
        `large report content, original report file will be deleted after merge\n${hugeContent}`,
        tool,
        false,
      );
      console.timeEnd('generate 100 mocked report files');

      console.time('merge and delete 100 mocked report files.');
      const mergedReportPath = tool.mergeReports('merge-100-reports', {
        rmOriginalReports: true,
        overwrite: true,
      });
      console.timeEnd('merge and delete 100 mocked report files');
      // assert merge success
      expect(existsSync(mergedReportPath)).toBe(true);
      // assert source report files deleted successfully
      tool.reportInfos.forEach((el: any) => {
        expect(existsSync(el.reportFilePath)).toBe(false);
      });
    },
  );
});
