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
import {
  createReportCliCommands,
  reportFileToMarkdown,
  splitReportFile,
} from '../../src/report-cli';
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

describe('createReportCliCommands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `midscene-report-cli-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exposes report-tool as the only generic report command', () => {
    const [command] = createReportCliCommands();
    expect(command.name).toBe('report-tool');
    expect('aliases' in command).toBe(false);
  });

  it('runs report split through the generic report command', async () => {
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
    const [command] = createReportCliCommands();
    const result = await command.def.handler({
      htmlPath: reportPath,
      outputDir,
      action: 'split',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Report split completed.');
    expect(result.content[0].text).toContain(`Output path: ${outputDir}`);

    const firstDump = JSON.parse(
      readFileSync(join(outputDir, '1.execution.json'), 'utf-8'),
    );
    const secondDump = JSON.parse(
      readFileSync(join(outputDir, '2.execution.json'), 'utf-8'),
    );

    expect(firstDump.executions[0].id).toBe('exec-1');
    expect(secondDump.executions[0].id).toBe('exec-2');
  });

  it('supports split via the JS SDK API', () => {
    const reportPath = join(tmpDir, 'input-report-sdk', 'index.html');
    mkdirSync(join(tmpDir, 'input-report-sdk'), { recursive: true });

    const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
    const dump = new ReportActionDump({
      groupName: 'sdk-test',
      groupDescription: 'sdk split test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-sdk-1', screenshot)],
    });

    const html = [
      generateImageScriptTag(screenshot.id, screenshot.base64),
      generateDumpScriptTag(dump.serialize(), { 'data-group-id': 'group-1' }),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');

    const outputDir = join(tmpDir, 'output-sdk');
    const result = splitReportFile({
      htmlPath: reportPath,
      outputDir,
    });

    expect(result.executionJsonFiles.length).toBe(1);
    expect(existsSync(join(outputDir, '1.execution.json'))).toBe(true);
  });

  it('supports to-markdown via the JS SDK API', async () => {
    const reportPath = join(tmpDir, 'input-report-sdk-md', 'index.html');
    mkdirSync(join(tmpDir, 'input-report-sdk-md'), { recursive: true });

    const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
    const dump = new ReportActionDump({
      groupName: 'sdk-markdown-test',
      groupDescription: 'sdk markdown test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-sdk-md-1', screenshot)],
    });

    const html = [
      generateImageScriptTag(screenshot.id, screenshot.base64),
      generateDumpScriptTag(dump.serialize(), { 'data-group-id': 'group-1' }),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');

    const outputDir = join(tmpDir, 'output-sdk-md');
    const result = await reportFileToMarkdown({
      htmlPath: reportPath,
      outputDir,
    });

    expect(result.markdownFiles.length).toBe(1);
    expect(existsSync(join(outputDir, 'report.md'))).toBe(true);
  });

  it('uses index.html when htmlPath points to a directory', async () => {
    const reportDir = join(tmpDir, 'input-report-dir');
    const reportPath = join(reportDir, 'index.html');
    mkdirSync(reportDir, { recursive: true });

    const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
    const dump = new ReportActionDump({
      groupName: 'split-dir-test',
      groupDescription: 'split-dir-test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-dir-1', screenshot)],
    });

    const html = [
      generateImageScriptTag(screenshot.id, screenshot.base64),
      generateDumpScriptTag(dump.serialize(), { 'data-group-id': 'group-1' }),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');

    const outputDir = join(tmpDir, 'output-dir');
    const [command] = createReportCliCommands();
    const result = await command.def.handler({
      htmlPath: reportDir,
      outputDir,
      action: 'split',
    });

    expect(result.isError).toBe(false);
    expect(existsSync(join(outputDir, '1.execution.json'))).toBe(true);
  });

  it('throws when htmlPath is a directory without index.html', async () => {
    const reportDir = join(tmpDir, 'input-report-dir-no-index');
    mkdirSync(reportDir, { recursive: true });

    const outputDir = join(tmpDir, 'output-dir-no-index');
    const [command] = createReportCliCommands();

    await expect(
      command.def.handler({
        htmlPath: reportDir,
        outputDir,
        action: 'split',
      }),
    ).rejects.toThrow(
      `"${reportDir}" is not an HTML report file, and no index.html was found under this directory.`,
    );
  });

  it('runs to-markdown export through the generic report command', async () => {
    const reportPath = join(tmpDir, 'input-report-md', 'index.html');
    mkdirSync(join(tmpDir, 'input-report-md'), { recursive: true });

    const screenshot1 = ScreenshotItem.create(fakeBase64(100), Date.now());
    const screenshot2 = ScreenshotItem.create(fakeBase64(120), Date.now());
    const dump1 = new ReportActionDump({
      groupName: 'markdown-test',
      groupDescription: 'markdown export test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-md-1', screenshot1)],
    });
    const dump2 = new ReportActionDump({
      groupName: 'markdown-test',
      groupDescription: 'markdown export test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-md-2', screenshot2)],
    });

    const html = [
      generateImageScriptTag(screenshot1.id, screenshot1.base64),
      generateImageScriptTag(screenshot2.id, screenshot2.base64),
      generateDumpScriptTag(dump1.serialize(), { 'data-group-id': 'group-1' }),
      generateDumpScriptTag(dump2.serialize(), { 'data-group-id': 'group-1' }),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');

    const outputDir = join(tmpDir, 'output-md');
    const [command] = createReportCliCommands();
    const result = await command.def.handler({
      htmlPath: reportPath,
      outputDir,
      action: 'to-markdown',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Markdown export completed.');
    expect(result.content[0].text).toContain(`Output path: ${outputDir}`);

    const mdContent = readFileSync(join(outputDir, 'report.md'), 'utf-8');
    expect(mdContent).toContain('# markdown-test');
    expect(mdContent).toContain('# execution-exec-md-1');
    expect(mdContent).toContain('# execution-exec-md-2');
    expect(mdContent).toContain('Suggested execution markdown files');

    expect(existsSync(join(outputDir, 'screenshots'))).toBe(true);
  });

  it('keeps only the latest execution for duplicate ids in markdown export', async () => {
    const reportPath = join(tmpDir, 'input-report-md-dedup', 'index.html');
    mkdirSync(join(tmpDir, 'input-report-md-dedup'), { recursive: true });

    const oldScreenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
    const newScreenshot = ScreenshotItem.create(fakeBase64(120), Date.now());
    const oldDump = new ReportActionDump({
      groupName: 'markdown-dedup-test',
      groupDescription: 'markdown export dedup test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-md-dedup', oldScreenshot)],
    });
    const newDump = new ReportActionDump({
      groupName: 'markdown-dedup-test',
      groupDescription: 'markdown export dedup test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-md-dedup', newScreenshot)],
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

    const outputDir = join(tmpDir, 'output-md-dedup');
    const [command] = createReportCliCommands();
    await command.def.handler({
      htmlPath: reportPath,
      outputDir,
      action: 'to-markdown',
    });

    const mdContent = readFileSync(join(outputDir, 'report.md'), 'utf-8');
    expect(mdContent).toContain('# execution-exec-md-dedup');
    expect(mdContent).toContain(newScreenshot.id);
    expect(mdContent).not.toContain(oldScreenshot.id);
  });

  it('copies file-backed screenshots during markdown export', async () => {
    const reportDir = join(tmpDir, 'input-report-md-file');
    const reportPath = join(reportDir, 'index.html');
    mkdirSync(reportDir, { recursive: true });

    const sourceScreenshotPath = join(tmpDir, 'source-shot.png');
    writeFileSync(sourceScreenshotPath, Buffer.from('png-binary'));

    const screenshotRef: ScreenshotRef = {
      type: 'midscene_screenshot_ref',
      id: 'file-shot',
      capturedAt: Date.now(),
      mimeType: 'image/png',
      storage: 'file',
      path: sourceScreenshotPath,
    };
    const dump = new ReportActionDump({
      groupName: 'markdown-file-test',
      groupDescription: 'markdown export file ref test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-md-file', screenshotRef)],
    });

    writeFileSync(
      reportPath,
      generateDumpScriptTag(dump.serialize(), { 'data-group-id': 'group-1' }),
      'utf-8',
    );

    const outputDir = join(tmpDir, 'output-md-file');
    const [command] = createReportCliCommands();
    await command.def.handler({
      htmlPath: reportPath,
      outputDir,
      action: 'to-markdown',
    });

    const exportedScreenshot = join(
      outputDir,
      'screenshots',
      'execution-1-task-1-file-shot.png',
    );
    expect(existsSync(exportedScreenshot)).toBe(true);
    expect(readFileSync(exportedScreenshot)).toEqual(
      readFileSync(sourceScreenshotPath),
    );
  });
});
