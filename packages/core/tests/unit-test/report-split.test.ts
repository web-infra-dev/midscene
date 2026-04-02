import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateDumpScriptTag, generateImageScriptTag } from '../../src/dump';
import type { ScreenshotRef } from '../../src/dump/screenshot-store';
import { splitReportHtmlByExecution } from '../../src/report';
import { ScreenshotItem } from '../../src/screenshot-item';
import { ExecutionDump, ReportActionDump } from '../../src/types';

function fakeBase64(sizeBytes: number): string {
  return `data:image/png;base64,${'A'.repeat(sizeBytes)}`;
}

function createExecution(
  id: string,
  screenshot: ScreenshotItem | ScreenshotRef,
): ExecutionDump {
  return new ExecutionDump({
    id,
    logTime: Date.now(),
    name: `execution-${id}`,
    tasks: [
      {
        taskId: `task-${id}`,
        type: 'Insight',
        subType: 'Locate',
        param: { prompt: 'find something' },
        uiContext: {
          screenshot,
          shotSize: { width: 1920, height: 1080 },
          shrunkShotToLogicalRatio: 1,
        },
        recorder: [],
        status: 'finished',
      },
    ],
  });
}

describe('splitReportHtmlByExecution', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `midscene-report-split-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should split report html into per-execution json files and externalize screenshots', async () => {
    const reportPath = join(tmpDir, 'input-report', 'index.html');
    mkdirSync(join(tmpDir, 'input-report'), { recursive: true });

    const screenshot1 = ScreenshotItem.create(fakeBase64(100), Date.now());
    const screenshot2 = ScreenshotItem.create(fakeBase64(120), Date.now());
    const dump1 = new ReportActionDump({
      groupName: 'split-test',
      groupDescription: 'split-test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-1', screenshot1)],
    });
    const dump2 = new ReportActionDump({
      groupName: 'split-test',
      groupDescription: 'split-test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-2', screenshot2)],
    });

    const html = [
      generateImageScriptTag(screenshot1.id, screenshot1.base64),
      generateImageScriptTag(screenshot2.id, screenshot2.base64),
      generateDumpScriptTag(dump1.serialize(), { 'data-group-id': 'group-1' }),
      generateDumpScriptTag(dump2.serialize(), { 'data-group-id': 'group-1' }),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');

    const outputDir = join(tmpDir, 'output');
    const result = splitReportHtmlByExecution({
      htmlPath: reportPath,
      outputDir,
    });

    expect(result.executionJsonFiles).toHaveLength(2);
    expect(result.screenshotFiles).toHaveLength(2);

    const firstDump = JSON.parse(
      readFileSync(result.executionJsonFiles[0], 'utf-8'),
    );
    const secondDump = JSON.parse(
      readFileSync(result.executionJsonFiles[1], 'utf-8'),
    );

    expect(firstDump.executions).toHaveLength(1);
    expect(secondDump.executions).toHaveLength(1);
    expect(firstDump.executions[0].id).toBe('exec-1');
    expect(secondDump.executions[0].id).toBe('exec-2');

    const firstRef = firstDump.executions[0].tasks[0].uiContext.screenshot;
    const secondRef = secondDump.executions[0].tasks[0].uiContext.screenshot;
    expect(firstRef.storage).toBe('file');
    expect(secondRef.storage).toBe('file');
    expect(firstRef.path).toMatch(/^\.\/screenshots\/.+\.png$/);
    expect(secondRef.path).toMatch(/^\.\/screenshots\/.+\.png$/);

    for (const screenshotFile of result.screenshotFiles) {
      expect(existsSync(screenshotFile)).toBe(true);
    }
  });

  it('should process large report incrementally without accumulating all dump scripts', () => {
    const reportPath = join(tmpDir, 'large-report', 'index.html');
    mkdirSync(join(tmpDir, 'large-report'), { recursive: true });

    const sharedScreenshot = ScreenshotItem.create(fakeBase64(128), Date.now());
    const scriptParts: string[] = [
      generateImageScriptTag(sharedScreenshot.id, sharedScreenshot.base64),
    ];

    const executionCount = 300;
    for (let i = 0; i < executionCount; i++) {
      const dump = new ReportActionDump({
        groupName: 'large-split-test',
        groupDescription: 'large-split-test',
        sdkVersion: '1.0.0-test',
        modelBriefs: [],
        executions: [createExecution(`exec-${i}`, sharedScreenshot)],
      });
      scriptParts.push(
        generateDumpScriptTag(dump.serialize(), { 'data-group-id': 'group-1' }),
      );
    }
    writeFileSync(reportPath, scriptParts.join('\n'), 'utf-8');

    const outputDir = join(tmpDir, 'large-output');
    const result = splitReportHtmlByExecution({
      htmlPath: reportPath,
      outputDir,
    });

    expect(result.executionJsonFiles).toHaveLength(executionCount);
    // shared screenshot should only be written once
    expect(result.screenshotFiles).toHaveLength(1);
  });

  it('should keep only the latest execution for duplicate execution ids', () => {
    const reportPath = join(tmpDir, 'dedup-report', 'index.html');
    mkdirSync(join(tmpDir, 'dedup-report'), { recursive: true });

    const oldScreenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
    const newScreenshot = ScreenshotItem.create(fakeBase64(120), Date.now());
    const oldDump = new ReportActionDump({
      groupName: 'dedup-test',
      groupDescription: 'dedup-test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-1', oldScreenshot)],
    });
    const newDump = new ReportActionDump({
      groupName: 'dedup-test',
      groupDescription: 'dedup-test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-1', newScreenshot)],
    });

    const html = [
      generateImageScriptTag(oldScreenshot.id, oldScreenshot.base64),
      generateImageScriptTag(newScreenshot.id, newScreenshot.base64),
      generateDumpScriptTag(oldDump.serialize(), {
        'data-group-id': 'group-1',
      }),
      generateDumpScriptTag(newDump.serialize(), {
        'data-group-id': 'group-1',
      }),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');

    const outputDir = join(tmpDir, 'dedup-output');
    const result = splitReportHtmlByExecution({
      htmlPath: reportPath,
      outputDir,
    });

    expect(result.executionJsonFiles).toHaveLength(1);
    expect(result.screenshotFiles).toHaveLength(1);

    const latestDump = JSON.parse(
      readFileSync(result.executionJsonFiles[0], 'utf-8'),
    );
    const latestRef = latestDump.executions[0].tasks[0].uiContext.screenshot;
    expect(latestRef.path).toContain(newScreenshot.id);
  });

  it('should reuse absolute file screenshot paths without creating nested absolute path directories', () => {
    const reportDir = join(tmpDir, 'absolute-report');
    const reportPath = join(reportDir, 'index.html');
    mkdirSync(reportDir, { recursive: true });

    const absoluteScreenshotPath = join(tmpDir, 'existing-shot.png');
    writeFileSync(absoluteScreenshotPath, Buffer.from('png-binary'));

    const screenshotRef: ScreenshotRef = {
      type: 'midscene_screenshot_ref',
      id: 'absolute-shot',
      capturedAt: Date.now(),
      mimeType: 'image/png',
      storage: 'file',
      path: absoluteScreenshotPath,
    };

    const dump = new ReportActionDump({
      groupName: 'absolute-path-test',
      groupDescription: 'absolute-path-test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-1', screenshotRef)],
    });

    writeFileSync(
      reportPath,
      generateDumpScriptTag(dump.serialize(), { 'data-group-id': 'group-1' }),
      'utf-8',
    );

    const outputDir = join(tmpDir, 'absolute-output');
    const result = splitReportHtmlByExecution({
      htmlPath: reportPath,
      outputDir,
    });

    expect(result.executionJsonFiles).toHaveLength(1);
    expect(result.screenshotFiles).toHaveLength(1);
    expect(
      existsSync(join(outputDir, 'screenshots', 'absolute-shot.png')),
    ).toBe(true);
    expect(existsSync(join(outputDir, 'Users'))).toBe(false);
  });
});
