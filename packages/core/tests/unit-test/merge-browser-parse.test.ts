/**
 * Test that simulates the browser's parsing logic for merged directory-mode reports.
 * Verifies the complete data roundtrip:
 * write directory report → mergeReports → extract dump → parse dump → verify executions
 */
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
import { extractLastDumpScriptSync } from '@/dump/html-utils';
import { generateDumpScriptTag, getBaseUrlFixScript } from '@/dump/html-utils';
import { ReportMergingTool } from '@/report';
import { ScreenshotItem } from '@/screenshot-item';
import { ExecutionDump, GroupedActionDump, type UIContext } from '@/types';
import { getReportTpl, reportHTMLContent } from '@/utils';
import { antiEscapeScriptTag, escapeScriptTag } from '@midscene/shared/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function fakeBase64(sizeBytes: number): string {
  return `data:image/png;base64,${'A'.repeat(sizeBytes)}`;
}

function createDump(screenshots: ScreenshotItem[]): GroupedActionDump {
  const tasks = screenshots.map((s, i) => ({
    type: 'Insight' as const,
    subType: 'Locate',
    param: { prompt: `task-${i}` },
    uiContext: {
      screenshot: s,
      size: { width: 1920, height: 1080 },
    } as UIContext,
    executor: async () => undefined,
    recorder: [],
    status: 'finished' as const,
  }));

  return new GroupedActionDump({
    sdkVersion: '1.0.0-test',
    groupName: 'test-group',
    groupDescription: 'test desc',
    modelBriefs: ['test-model'],
    executions: [
      new ExecutionDump({
        logTime: Date.now(),
        name: 'test-execution',
        tasks,
      }),
    ],
  });
}

/**
 * Write a directory-mode report: screenshots as separate PNG files,
 * HTML with dump JSON referencing them via relative paths.
 */
function writeDirectoryReport(
  reportDir: string,
  dump: GroupedActionDump,
): string {
  const reportPath = join(reportDir, 'index.html');
  mkdirSync(reportDir, { recursive: true });

  // Write screenshots to a subdirectory
  const screenshotsDir = join(reportDir, 'screenshots');
  mkdirSync(screenshotsDir, { recursive: true });

  const screenshots = dump.collectAllScreenshots();
  for (const screenshot of screenshots) {
    const ext = screenshot.extension;
    const absolutePath = join(screenshotsDir, `${screenshot.id}.${ext}`);
    const buffer = Buffer.from(screenshot.rawBase64, 'base64');
    writeFileSync(absolutePath, buffer);
    screenshot.markPersistedToPath(
      `./screenshots/${screenshot.id}.${ext}`,
      absolutePath,
    );
  }

  // Write HTML with dump JSON (compact $screenshot references)
  const serialized = dump.serialize();
  writeFileSync(
    reportPath,
    `${getReportTpl()}${getBaseUrlFixScript()}${generateDumpScriptTag(serialized)}`,
  );

  return reportPath;
}

describe('browser parse simulation for merged directory-mode reports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `midscene-browser-parse-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('step 1: verify directory mode report dump can be extracted', async () => {
    const reportDir = join(tmpDir, 'step1-report');
    const screenshot = ScreenshotItem.create(fakeBase64(500), Date.now());
    const dump = createDump([screenshot]);
    const reportPath = writeDirectoryReport(reportDir, dump);

    // Read the HTML and extract dump the same way mergeReports does
    const dumpString = extractLastDumpScriptSync(reportPath);
    expect(dumpString).toBeTruthy();

    // Unescape and parse (as the browser would)
    const unescaped = antiEscapeScriptTag(dumpString);
    const parsed = JSON.parse(unescaped);

    expect(parsed.executions).toBeDefined();
    expect(parsed.executions.length).toBe(1);
    expect(parsed.executions[0].tasks.length).toBe(1);
  });

  it('step 2: verify merged report preserves directory mode with screenshots', async () => {
    const tool = new ReportMergingTool();
    const numReports = 2;

    // Create 2 directory mode reports
    for (let r = 0; r < numReports; r++) {
      const reportDir = join(tmpDir, `step2-report-${r}`);
      const screenshots = [
        ScreenshotItem.create(fakeBase64(400 + r * 50), Date.now()),
      ];
      const dump = createDump(screenshots);
      const reportPath = writeDirectoryReport(reportDir, dump);

      tool.append({
        reportFilePath: reportPath,
        reportAttributes: {
          testDescription: `Test ${r}`,
          testDuration: 1000,
          testId: `test-${r}`,
          testStatus: 'passed',
          testTitle: `Test Case ${r}`,
        },
      });
    }

    const mergedPath = tool.mergeReports('browser-parse-test', {
      overwrite: true,
    });
    expect(existsSync(mergedPath!)).toBe(true);

    // Merged output should be directory mode: {name}/index.html
    expect(mergedPath!).toMatch(/index\.html$/);

    // Read the full merged HTML
    const mergedHtml = readFileSync(mergedPath!, 'utf-8');

    // Verify merged file is not bloated with garbage from streamImageScriptsToFile
    const mergedSizeMB = mergedHtml.length / 1024 / 1024;
    expect(mergedSizeMB).toBeLessThan(15);

    // Verify base URL fix script is injected
    expect(mergedHtml).toContain('document.createElement("base")');

    // Verify screenshots directory was created alongside merged report
    const mergedScreenshotsDir = join(dirname(mergedPath!), 'screenshots');
    expect(existsSync(mergedScreenshotsDir)).toBe(true);

    // Verify screenshot files were copied
    const screenshotFiles = readdirSync(mergedScreenshotsDir);
    expect(screenshotFiles.length).toBeGreaterThanOrEqual(numReports);

    // Extract and parse the last dump
    const lastDump = extractLastDumpScriptSync(mergedPath!);
    expect(lastDump).toBeTruthy();

    const content = antiEscapeScriptTag(lastDump);
    const parsed = JSON.parse(content);

    expect(parsed.executions).toBeDefined();
    expect(parsed.executions.length).toBe(1);
    expect(parsed.executions[0].tasks.length).toBe(1);

    // Verify screenshot reference uses relative path (directory mode preserved)
    const screenshotRef = parsed.executions[0].tasks[0].uiContext?.screenshot;
    expect(screenshotRef).toBeDefined();
    expect(screenshotRef.base64).toMatch(/^\.\/screenshots\//);

    // Verify the referenced screenshot file exists
    const screenshotBasename = screenshotRef.base64.replace(
      './screenshots/',
      '',
    );
    expect(screenshotFiles).toContain(screenshotBasename);
  });

  it('step 3: verify extractLastDumpScriptSync + escapeScriptTag roundtrip', async () => {
    const reportDir = join(tmpDir, 'step3-report');
    const screenshot = ScreenshotItem.create(fakeBase64(300), Date.now());
    const dump = createDump([screenshot]);
    const reportPath = writeDirectoryReport(reportDir, dump);

    // Step 1: extract (what mergeReports does)
    const extracted = extractLastDumpScriptSync(reportPath);

    // Step 2: escape again (what reportHTMLContent does)
    const doubleEscaped = escapeScriptTag(extracted);

    // Step 3: unescape (what browser does via antiEscapeScriptTag)
    const finalContent = antiEscapeScriptTag(doubleEscaped);

    // Verify the JSON is valid and has correct structure
    const parsed = JSON.parse(finalContent);
    expect(parsed.executions).toBeDefined();
    expect(parsed.executions.length).toBe(1);
    expect(parsed.executions[0].tasks.length).toBe(1);

    // Verify screenshot reference
    const screenshotRef = parsed.executions[0].tasks[0].uiContext?.screenshot;
    expect(screenshotRef).toBeDefined();
  });
});
