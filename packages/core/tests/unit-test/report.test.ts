import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { getTmpFile } from '../../src/utils';
// @ts-ignore no types in es folder
import { writeDumpReport } from '../../dist/es/utils';
// @ts-ignore no types in es folder
import { ReportMergingTool } from '../../dist/es/report';

function generateNReports(n: number, c: string, t: ReportMergingTool) {
    let expectedContents = [];
    for (let i = 0; i < n; i++) {
        const content = `${c} ${i}`;
        expectedContents.push(content);
        const reportPath = writeDumpReport(`report-to-merge-${i}`, {
            dumpString: content,
        });
        t.append({
            reportFilePath: reportPath, reportAttributes: {
                testDescription: `desc${i}`,
                testDuration: 1,
                testId: `${i}`,
                testStatus: 'passed',
                testTitle: `${i}`
            }
        });
    }
    return expectedContents;
}

describe('repotMergingTool', () => {

    it('should merge 3 mocked reports', async () => {
        const tool = new ReportMergingTool();
        let expectedContents = generateNReports(3, 'report content', tool);
        // execute merge operation
        const mergedReportPath = tool.mergeReports();
        // assert merge success
        const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
        expectedContents.forEach(content => {
            expect(mergedReportContent).contains(content);
        });
    });

    it('should merge 3 mocked reports, and delete original reports after that.', async () => {
        const tool = new ReportMergingTool();
        let expectedContents = generateNReports(3, 'report content, original report file deleted', tool);
        // assert merge success
        const mergedReportPath = tool.mergeReports(undefined, { rmOriginalReports: true });
        const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
        expectedContents.forEach(content => {
            expect(mergedReportContent).contains(content);
        });
        // assert source report files deleted successfully
        tool['reportInfos'].forEach((el: any) => {
            expect(existsSync(el.reportFilePath)).toBe(false);
        });
    });



    it('should merge 3 mocked reports, use user custom filename', async () => {
        const tool = new ReportMergingTool();
        let expectedContents = generateNReports(3, 'report content', tool);
        // assert merge success
        const mergedReportPath = tool.mergeReports('my-custom-merged-report-filename');
        const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
        expectedContents.forEach(content => {
            expect(mergedReportContent).contains(content);
        });
    });

    it('should merge 3 mocked reports twice, use user custom filename, overwrite old report on second merge', async () => {
        const tool = new ReportMergingTool();
        // first reports
        generateNReports(3, 'report content', tool);
        // assert merge success
        tool.mergeReports('my-custom-merged-report-filename-overwrite');
        tool.clear();
        // second reports
        const expectedContents = generateNReports(3, 'new report content', tool);
        // assert merge success
        const mergedReportPath = tool.mergeReports('my-custom-merged-report-filename-overwrite', { overwrite: true });
        const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
        expectedContents.forEach(content => {
            expect(mergedReportContent).contains(content);
        });
    });



    it('should extract content from last script tag in large HTML', async () => {
        const tool = new ReportMergingTool();
        // create 3M html temp file
        const hugeContent = Buffer.alloc(3 * 1024 * 1024 - 200, 'a').toString()
        const largeHtmlPath = getTmpFile('html');
        if (!largeHtmlPath) {
            throw new Error('Failed to create temp html file');
        }
        writeFileSync(largeHtmlPath,
            `<!DOCTYPE html>
  <html>
  <head><title>Test</title></head>
    <body>
        ${hugeContent}
        <script type="midscene_web_dump" type="application/json">
        test penult
        </script>

    </body>
  </html>
    <script type="midscene_web_dump" type="application/json">
        test last
    </script>
`, 'utf8');
        const result = await tool['extractLastScriptContentFromEnd'](largeHtmlPath)
        unlinkSync(largeHtmlPath); // remove temp file
        expect(result).toBe('test last')
    });

    it('should merge 200 mocked reports, and delete original reports after that.',
        { timeout: 30000 },
        async () => {
            const tool = new ReportMergingTool();
            let expectedContents = generateNReports(200, 'report content, original report file deleted', tool);
            // assert merge success
            const mergedReportPath = tool.mergeReports('merge-200-reports', { rmOriginalReports: true });
            const mergedReportContent = readFileSync(mergedReportPath!, 'utf-8');
            expectedContents.forEach(content => {
                expect(mergedReportContent).contains(content);
            });
            // assert source report files deleted successfully
            tool['reportInfos'].forEach((el: any) => {
                expect(existsSync(el.reportFilePath)).toBe(false);
            });
        })
});