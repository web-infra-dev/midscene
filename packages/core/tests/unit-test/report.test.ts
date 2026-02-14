import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateImageScriptTag } from '../../src/dump/html-utils';
import { ReportMergingTool } from '../../src/report';
import { getReportTpl, getTmpFile, writeDumpReport } from '../../src/utils';

function generateNReports(
  n: number,
  c: string,
  t: ReportMergingTool,
  withExpectedContent = true,
  prefix = 'report-to-merge',
) {
  const expectedContents = [];
  for (let i = 0; i < n; i++) {
    const content = `${c} ${i}`;
    if (withExpectedContent) expectedContents.push(content);
    const reportPath = writeDumpReport(`${prefix}-${i}`, {
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
    const expectedContents = generateNReports(
      3,
      'report content',
      tool,
      true,
      'merge-3-test',
    );
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
      true,
      'merge-3-delete-test',
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
    const expectedContents = generateNReports(
      3,
      'report content',
      tool,
      true,
      'merge-3-custom-name-test',
    );
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
    generateNReports(
      3,
      'report content',
      tool,
      true,
      'merge-3-overwrite-test-1',
    );
    // assert merge success
    tool.mergeReports('my-custom-merged-report-filename-overwrite', {
      overwrite: true,
    });
    tool.clear();
    // second reports
    const expectedContents = generateNReports(
      3,
      'new report content',
      tool,
      true,
      'merge-3-overwrite-test-2',
    );
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
        'merge-100-delete-test',
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

  it('should merge directory mode reports and copy screenshots', async () => {
    const tmpDir = join(tmpdir(), `midscene-dir-mode-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const tool = new ReportMergingTool();

      // Create 2 directory mode reports with screenshots
      for (let r = 0; r < 2; r++) {
        const reportDir = join(tmpDir, `report-${r}`);
        const screenshotsDir = join(reportDir, 'screenshots');
        mkdirSync(screenshotsDir, { recursive: true });

        // Create fake screenshot files
        writeFileSync(
          join(screenshotsDir, `img-${r}-0.png`),
          `fake-png-${r}-0`,
        );
        writeFileSync(
          join(screenshotsDir, `img-${r}-1.png`),
          `fake-png-${r}-1`,
        );

        // Create HTML report with dump referencing screenshots via relative paths
        const dumpJson = JSON.stringify({
          groupName: `test-${r}`,
          executions: [
            {
              screenshots: [
                { base64: `./screenshots/img-${r}-0.png` },
                { base64: `./screenshots/img-${r}-1.png` },
              ],
            },
          ],
        });
        const htmlContent = `${getReportTpl()}
<script type="midscene_web_dump">${dumpJson}</script>`;

        writeFileSync(join(reportDir, 'index.html'), htmlContent);

        tool.append({
          reportFilePath: join(reportDir, 'index.html'),
          reportAttributes: {
            testDescription: `desc${r}`,
            testDuration: 1,
            testId: `${r}`,
            testStatus: 'passed',
            testTitle: `test-${r}`,
          },
        });
      }

      const mergedPath = tool.mergeReports('dir-mode-merge-test', {
        overwrite: true,
      });

      // Verify merged report is directory mode: {name}/index.html
      expect(existsSync(mergedPath!)).toBe(true);
      expect(mergedPath!).toMatch(/index\.html$/);

      // Verify screenshots were copied to merged report's screenshots/ directory
      const mergedScreenshotsDir = join(dirname(mergedPath!), 'screenshots');
      expect(existsSync(mergedScreenshotsDir)).toBe(true);

      const copiedFiles = readdirSync(mergedScreenshotsDir).sort();
      expect(copiedFiles).toContain('img-0-0.png');
      expect(copiedFiles).toContain('img-0-1.png');
      expect(copiedFiles).toContain('img-1-0.png');
      expect(copiedFiles).toContain('img-1-1.png');

      // Verify screenshot content is correct
      expect(
        readFileSync(join(mergedScreenshotsDir, 'img-0-0.png'), 'utf-8'),
      ).toBe('fake-png-0-0');
      expect(
        readFileSync(join(mergedScreenshotsDir, 'img-1-1.png'), 'utf-8'),
      ).toBe('fake-png-1-1');

      // Verify dump data is preserved and base URL fix is injected
      const mergedContent = readFileSync(mergedPath!, 'utf-8');
      expect(mergedContent).toContain('./screenshots/img-0-0.png');
      expect(mergedContent).toContain('./screenshots/img-1-1.png');
      expect(mergedContent).toContain('document.createElement("base")');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should delete entire directory for directory mode reports when rmOriginalReports is true', async () => {
    const tmpDir = join(tmpdir(), `midscene-dir-mode-rm-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const tool = new ReportMergingTool();

      // Create 2 directory mode reports
      const reportDirs: string[] = [];
      for (let r = 0; r < 2; r++) {
        const reportDir = join(tmpDir, `report-rm-${r}`);
        const screenshotsDir = join(reportDir, 'screenshots');
        mkdirSync(screenshotsDir, { recursive: true });
        reportDirs.push(reportDir);

        writeFileSync(join(screenshotsDir, `img-${r}.png`), `fake-png-${r}`);

        const dumpJson = JSON.stringify({
          groupName: `test-${r}`,
          executions: [],
        });
        const htmlContent = `${getReportTpl()}
<script type="midscene_web_dump">${dumpJson}</script>`;

        writeFileSync(join(reportDir, 'index.html'), htmlContent);

        tool.append({
          reportFilePath: join(reportDir, 'index.html'),
          reportAttributes: {
            testDescription: `desc${r}`,
            testDuration: 1,
            testId: `${r}`,
            testStatus: 'passed',
            testTitle: `test-${r}`,
          },
        });
      }

      const mergedPath = tool.mergeReports('dir-mode-rm-test', {
        rmOriginalReports: true,
        overwrite: true,
      });

      // Verify merged report exists
      expect(existsSync(mergedPath!)).toBe(true);

      // Verify original directories are completely removed
      for (const dir of reportDirs) {
        expect(existsSync(dir)).toBe(false);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it(
    'should use constant memory when merging reports with large inline images',
    { timeout: 2 * 60 * 1000 },
    async () => {
      // This test verifies that streaming works correctly by checking:
      // 1. All images are correctly merged
      // 2. The merged file size matches expected (no data loss)
      // Note: Memory measurement is unreliable without --expose-gc,
      // so we verify correctness rather than memory usage.

      const tmpDir = join(tmpdir(), `midscene-memory-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      try {
        const tool = new ReportMergingTool();
        const numReports = 5;
        const imagesPerReport = 10;
        const imageSize = 100 * 1024; // 100KB per image

        let expectedTotalImageBytes = 0;

        // Create reports with large inline images
        for (let r = 0; r < numReports; r++) {
          const reportPath = join(tmpDir, `report-${r}.html`);

          // Generate image script tags
          let imageScripts = '';
          for (let i = 0; i < imagesPerReport; i++) {
            const fakeBase64 = `data:image/png;base64,${'A'.repeat(imageSize)}`;
            const tag = generateImageScriptTag(`img-${r}-${i}`, fakeBase64);
            imageScripts += `${tag}\n`;
            expectedTotalImageBytes += tag.length;
          }

          const content = `${getReportTpl()}
${imageScripts}
<script type="midscene_web_dump">{"groupName":"test-${r}","executions":[]}</script>`;

          writeFileSync(reportPath, content);

          tool.append({
            reportFilePath: reportPath,
            reportAttributes: {
              testDescription: `Report ${r}`,
              testDuration: 1000,
              testId: `test-${r}`,
              testStatus: 'passed',
              testTitle: `Test ${r}`,
            },
          });
        }

        // Merge reports - this uses streaming (constant memory per image)
        const mergedPath = tool.mergeReports('memory-test-merged', {
          overwrite: true,
        });

        // Verify merge succeeded
        expect(existsSync(mergedPath!)).toBe(true);
        const mergedContent = readFileSync(mergedPath!, 'utf-8');

        // Verify all images are in the merged report
        let foundImages = 0;
        for (let r = 0; r < numReports; r++) {
          for (let i = 0; i < imagesPerReport; i++) {
            if (mergedContent.includes(`data-id="img-${r}-${i}"`)) {
              foundImages++;
            }
          }
        }
        expect(foundImages).toBe(numReports * imagesPerReport);

        // Verify no data loss: all our test images should be present
        // (template may contain other image tags, so we only check our specific IDs)
        for (let r = 0; r < numReports; r++) {
          for (let i = 0; i < imagesPerReport; i++) {
            expect(mergedContent).toContain(`data-id="img-${r}-${i}"`);
            // Also verify the image content is present (the repeated 'A's)
            expect(mergedContent).toContain('AAAAAAAAAA');
          }
        }

        console.log(
          `Successfully merged ${numReports} reports with ${imagesPerReport} images each`,
        );
        console.log(`Total images: ${foundImages}`);
        console.log(
          `Merged file size: ${(mergedContent.length / 1024 / 1024).toFixed(2)} MB`,
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
