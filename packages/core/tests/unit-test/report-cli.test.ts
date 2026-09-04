import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCliArgs, runToolsCLI } from '@midscene/shared/cli';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { generateDumpScriptTag, generateImageScriptTag } from '../../src/dump';
import type { ScreenshotRef } from '../../src/dump/screenshot-store';
import {
  createReportCliCommands,
  mergeReportFiles,
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
  // Some report fixtures intentionally model already-serialized dumps with
  // ScreenshotRef, while ExecutionTask still types live UIContext screenshots
  // as ScreenshotItem.
  const uiContextScreenshot =
    screenshot instanceof ScreenshotItem
      ? screenshot
      : (screenshot as unknown as ScreenshotItem);

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
          screenshot: uiContextScreenshot,
          shotSize: { width: 1920, height: 1080 },
          shrunkShotToLogicalRatio: 1,
        },
        executor: async () => undefined,
        recorder: [],
        status: 'finished',
      },
    ],
  });
}

function validFailedAnalysisResult(): Record<string, unknown> {
  return {
    report: '/absolute/path/report.html',
    reportStatus: 'fail',
    resultAssessment: 'true_fail',
    resultAssessmentReason: 'The required state remained absent.',
    causeCategories: [
      {
        category: 'tested_system',
        confidence: 'high',
        reason:
          'The correct action completed but the application state did not update.',
      },
    ],
    conclusion: 'The recorded failure is established.',
    failureReason: 'The application did not expose the required state.',
    failedStep: 'Wait for the required state after the correct action.',
    evidence: [
      {
        source: 'action record',
        fact: 'The action completed before the required state was checked.',
      },
    ],
    confidence: 'high',
    limitations: 'none',
  };
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
    expect(command.def.schema).toHaveProperty('reportStatus');
    expect(command.def.schema).toHaveProperty('resultAssessment');
  });

  it('generates a failed-result schema and renders a matching result', async () => {
    const [command] = createReportCliCommands();
    const schemaResponse = await command.def.handler({
      action: 'analysis-template',
      reportStatus: 'fail',
      resultAssessment: 'true_fail',
    });
    const schema = JSON.parse(schemaResponse.content[0].text);
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.title).toBe('Midscene failed-report analysis result');
    expect(schema).not.toHaveProperty('anyOf');
    expect(schema.properties.resultAssessment.const).toBe('true_fail');
    expect(JSON.stringify(schema)).toContain('resultAssessmentReason');
    expect(JSON.stringify(schema)).toContain('failureReason');
    expect(JSON.stringify(schema)).toContain('failedStep');
    expect(JSON.stringify(schema)).not.toContain('rootCauseStatus');

    const resultPath = join(tmpDir, 'analysis-result.json');
    const outputPath = join(tmpDir, 'analysis-result.md');
    writeFileSync(
      resultPath,
      JSON.stringify(validFailedAnalysisResult()),
      'utf8',
    );
    const renderResponse = await command.def.handler({
      action: 'render-analysis',
      analysisResultPath: resultPath,
      analysisOutputPath: outputPath,
    });

    expect(renderResponse.isError).toBe(false);
    const markdown = readFileSync(outputPath, 'utf8');
    expect(renderResponse.content[0].text).toBe(
      `${markdown}\n\n**Markdown report:** [Open file](<${outputPath}>)`,
    );
    expect(markdown).toContain('**Result assessment:** `true_fail`');
    expect(markdown).toContain('**Result-assessment reason:**');
    expect(markdown).toContain('**Cause categories:**');
    expect(markdown).toContain(
      '`tested_system` (`high` confidence) — 被测系统状态与行为异常',
    );
    expect(markdown).toContain(
      'The correct action completed but the application state did not update.',
    );
    expect(markdown).toContain('**Failure reason:**');
    expect(markdown).toContain('**Failed step:**');
  });

  it.each(['true_fail', 'false_fail', 'unverifiable', 'inconclusive'] as const)(
    'generates only the selected failed-result schema for %s',
    async (resultAssessment) => {
      const [command] = createReportCliCommands();
      const response = await command.def.handler({
        action: 'analysis-template',
        reportStatus: 'fail',
        resultAssessment,
      });
      const schema = JSON.parse(response.content[0].text);

      expect(schema).not.toHaveProperty('anyOf');
      expect(schema.properties.resultAssessment.const).toBe(resultAssessment);
      expect(schema.properties).toHaveProperty('causeCategories');
      expect(schema.required).toContain('causeCategories');
      if (resultAssessment === 'true_fail') {
        expect(schema.properties).toHaveProperty('failureReason');
        expect(schema.properties).toHaveProperty('failedStep');
      } else {
        expect(schema.properties).not.toHaveProperty('failureReason');
        expect(schema.properties).not.toHaveProperty('failedStep');
      }
    },
  );

  it.each(['true_pass', 'false_pass', 'unverifiable', 'inconclusive'] as const)(
    'generates only the selected passed-result schema for %s',
    async (resultAssessment) => {
      const [command] = createReportCliCommands();
      const response = await command.def.handler({
        action: 'analysis-template',
        reportStatus: 'pass',
        resultAssessment,
      });
      const schema = JSON.parse(response.content[0].text);

      expect(schema.title).toBe('Midscene passed-report analysis result');
      expect(schema).not.toHaveProperty('anyOf');
      expect(schema.properties.resultAssessment.const).toBe(resultAssessment);
      expect(schema.properties).toHaveProperty('causeCategories');
      expect(schema.required).toContain('causeCategories');
      if (resultAssessment === 'false_pass') {
        expect(schema.properties).toHaveProperty('passClaimIssuePoint');
      } else {
        expect(schema.properties).not.toHaveProperty('passClaimIssuePoint');
      }
    },
  );

  it('generates the incomplete-execution JSON Schema', async () => {
    const [command] = createReportCliCommands();
    const schemaResponse = await command.def.handler({
      action: 'analysis-template',
      reportStatus: 'incomplete',
    });
    const schema = JSON.parse(schemaResponse.content[0].text);

    expect(schema.title).toBe('Midscene incomplete-execution analysis result');
    expect(schema).not.toHaveProperty('anyOf');
    expect(schema.properties).toHaveProperty('observedIssue');
    expect(schema.properties).toHaveProperty('interruptionReason');
    expect(schema.properties).toHaveProperty('lastRecordedStep');
    expect(schema.properties).toHaveProperty('confidence');
    expect(schema.properties).toHaveProperty('causeCategories');
    expect([...schema.required].sort()).toEqual(
      [
        'report',
        'reportStatus',
        'conclusion',
        'observedIssue',
        'interruptionReason',
        'lastRecordedStep',
        'evidence',
        'confidence',
        'limitations',
        'causeCategories',
      ].sort(),
    );
    expect(schema.properties).not.toHaveProperty('lastTaskStatus');
    expect(schema.properties).not.toHaveProperty('observedIssueStatus');
    expect(schema.properties).not.toHaveProperty('interruptionCauseStatus');
  });

  it('returns the schema and an analysis-result path derived from the HTML filename', async () => {
    const [command] = createReportCliCommands();
    const htmlPath = join(tmpDir, 'sample-report.html');
    writeFileSync(htmlPath, '<html></html>', 'utf8');

    const firstResponse = await command.def.handler({
      action: 'analysis-template',
      reportStatus: 'fail',
      resultAssessment: 'true_fail',
      htmlPath,
      outputDir: tmpDir,
    });
    const first = JSON.parse(firstResponse.content[0].text);
    expect(Object.keys(first).sort()).toEqual(
      ['analysisResultPath', 'schema'].sort(),
    );
    expect(first.analysisResultPath).toBe(
      join(tmpDir, 'sample-report-analysis-json.json'),
    );
    expect(first.schema.title).toBe('Midscene failed-report analysis result');
    expect(first.schema.properties.resultAssessment.const).toBe('true_fail');
    expect(existsSync(first.analysisResultPath)).toBe(false);
    expect(existsSync(join(tmpDir, 'sample-report-analysis-schema.json'))).toBe(
      false,
    );
    const firstOutputPath = join(tmpDir, 'sample-report-analysis-result.md');
    expect(existsSync(firstOutputPath)).toBe(false);

    writeFileSync(
      first.analysisResultPath,
      JSON.stringify(validFailedAnalysisResult()),
      'utf8',
    );
    const renderResponse = await command.def.handler({
      action: 'render-analysis',
      analysisResultPath: first.analysisResultPath,
    });
    expect(existsSync(firstOutputPath)).toBe(true);
    expect(renderResponse.content[0].text).toBe(
      `${readFileSync(firstOutputPath, 'utf8')}\n\n**Markdown report:** [Open file](<${firstOutputPath}>)`,
    );

    const secondResponse = await command.def.handler({
      action: 'analysis-template',
      reportStatus: 'fail',
      resultAssessment: 'true_fail',
      htmlPath,
      outputDir: tmpDir,
    });
    const second = JSON.parse(secondResponse.content[0].text);
    expect(second.analysisResultPath).toBe(
      join(tmpDir, 'sample-report-analysis-json-1.json'),
    );
    expect(second.schema).toEqual(first.schema);
  });

  it.each(['analysis-json.json', 'analysis-result.md'] as const)(
    'allocates a new analysis-result suffix when %s already exists',
    async (occupiedSuffix) => {
      const [command] = createReportCliCommands();
      const htmlPath = join(tmpDir, `occupied-${occupiedSuffix}.html`);
      const reportName = `occupied-${occupiedSuffix}`;
      writeFileSync(
        join(tmpDir, `${reportName}-${occupiedSuffix}`),
        'occupied',
        'utf8',
      );

      const response = await command.def.handler({
        action: 'analysis-template',
        reportStatus: 'pass',
        resultAssessment: 'true_pass',
        htmlPath,
        outputDir: tmpDir,
      });
      const preparation = JSON.parse(response.content[0].text);

      expect(preparation.analysisResultPath).toBe(
        join(tmpDir, `${reportName}-analysis-json-1.json`),
      );
      expect(preparation.schema.title).toBe(
        'Midscene passed-report analysis result',
      );
    },
  );

  it('skips every occupied analysis-result suffix', async () => {
    const [command] = createReportCliCommands();
    const htmlPath = join(tmpDir, 'multiple-collisions.html');
    writeFileSync(
      join(tmpDir, 'multiple-collisions-analysis-json.json'),
      'occupied',
      'utf8',
    );
    writeFileSync(
      join(tmpDir, 'multiple-collisions-analysis-result-1.md'),
      'occupied',
      'utf8',
    );

    const response = await command.def.handler({
      action: 'analysis-template',
      reportStatus: 'incomplete',
      htmlPath,
      outputDir: tmpDir,
    });
    const preparation = JSON.parse(response.content[0].text);

    expect(preparation.analysisResultPath).toBe(
      join(tmpDir, 'multiple-collisions-analysis-json-2.json'),
    );
    expect(preparation.schema.properties.reportStatus.const).toBe('incomplete');
  });

  it('validates analysis action parameters', async () => {
    const [command] = createReportCliCommands();
    await expect(
      command.def.handler({ action: 'analysis-template' }),
    ).rejects.toThrow('report-tool: --reportStatus is required');
    await expect(
      command.def.handler({
        action: 'analysis-template',
        reportStatus: 'unknown' as never,
      }),
    ).rejects.toThrow();
    await expect(
      command.def.handler({
        action: 'analysis-template',
        reportStatus: 'fail',
      }),
    ).rejects.toThrow('--resultAssessment is required');
    await expect(
      command.def.handler({
        action: 'analysis-template',
        reportStatus: 'fail',
        resultAssessment: 'unknown' as never,
      }),
    ).rejects.toThrow('--resultAssessment is required');
    await expect(
      command.def.handler({
        action: 'analysis-template',
        reportStatus: 'pass',
      }),
    ).rejects.toThrow('--resultAssessment is required');
    await expect(
      command.def.handler({
        action: 'analysis-template',
        reportStatus: 'pass',
        resultAssessment: 'true_fail',
      }),
    ).rejects.toThrow('--resultAssessment is required');
    await expect(
      command.def.handler({
        action: 'analysis-template',
        reportStatus: 'incomplete',
        resultAssessment: 'true_pass',
      }),
    ).rejects.toThrow(
      '--resultAssessment is only supported when --reportStatus is "fail" or "pass"',
    );
    await expect(
      command.def.handler({ action: 'render-analysis' }),
    ).rejects.toThrow('report-tool: --analysisResultPath is required');
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

  it('throws SDK-friendly validation errors for splitReportFile', () => {
    expect(() =>
      splitReportFile({
        htmlPath: '',
        outputDir: join(tmpDir, 'output-sdk-missing-html'),
      }),
    ).toThrow('splitReportFile: htmlPath is required');

    expect(() =>
      splitReportFile({
        htmlPath: join(tmpDir, 'input-report-sdk-missing-output', 'index.html'),
        outputDir: '',
      }),
    ).toThrow('splitReportFile: outputDir is required');
  });

  it('throws CLI-specific validation errors for split action parameters', async () => {
    const [command] = createReportCliCommands();

    await expect(
      command.def.handler({
        action: 'split',
        outputDir: join(tmpDir, 'output-cli-missing-html'),
      }),
    ).rejects.toThrow('report-tool: --htmlPath is required');

    await expect(
      command.def.handler({
        action: 'split',
        htmlPath: join(tmpDir, 'input-report-cli-missing-output', 'index.html'),
      }),
    ).rejects.toThrow('report-tool: --outputDir is required');
  });

  it('supports to-markdown via the JS SDK API', async () => {
    const reportPath = join(tmpDir, 'input-report-sdk-md', 'sdk-report.html');
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

    expect(result.markdownFiles).toEqual([join(outputDir, 'sdk-report.md')]);
    expect(existsSync(join(outputDir, 'sdk-report.md'))).toBe(true);
  });

  it('throws SDK-friendly validation errors for reportFileToMarkdown', async () => {
    await expect(
      reportFileToMarkdown({
        htmlPath: '',
        outputDir: join(tmpDir, 'output-sdk-md-missing-html'),
      }),
    ).rejects.toThrow('reportFileToMarkdown: htmlPath is required');

    await expect(
      reportFileToMarkdown({
        htmlPath: join(
          tmpDir,
          'input-report-sdk-md-missing-output',
          'index.html',
        ),
        outputDir: '',
      }),
    ).rejects.toThrow('reportFileToMarkdown: outputDir is required');
  });

  it('throws CLI-specific validation errors for to-markdown parameters', async () => {
    const [command] = createReportCliCommands();

    await expect(
      command.def.handler({
        action: 'to-markdown',
        outputDir: join(tmpDir, 'output-cli-md-missing-html'),
      }),
    ).rejects.toThrow('report-tool: --htmlPath is required');

    await expect(
      command.def.handler({
        action: 'to-markdown',
        htmlPath: join(
          tmpDir,
          'input-report-cli-md-missing-output',
          'index.html',
        ),
      }),
    ).rejects.toThrow('report-tool: --outputDir is required');
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

  it('rejects unsupported action values before executing report logic', async () => {
    const [command] = createReportCliCommands();

    await expect(
      command.def.handler({
        action: 'invalid-action',
        htmlPath: join(tmpDir, 'missing-report', 'index.html'),
        outputDir: join(tmpDir, 'unused-output'),
      }),
    ).rejects.toThrow(
      'report-tool: unsupported --action value "invalid-action". Currently supported: inspect, analysis-template, render-analysis, split, to-markdown, merge-html',
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

    const mdContent = readFileSync(join(outputDir, 'index.md'), 'utf-8');
    expect(mdContent).toContain('# markdown-test');
    expect(mdContent).toContain('# execution-exec-md-1');
    expect(mdContent).toContain('# execution-exec-md-2');
    expect(mdContent).not.toContain('Suggested execution markdown files');

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

    const mdContent = readFileSync(join(outputDir, 'index.md'), 'utf-8');
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

    // The markdown must reference the exported (prefixed) file name, not the
    // original source path. See issue #2392.
    const mdContent = readFileSync(join(outputDir, 'index.md'), 'utf-8');
    expect(mdContent).toContain(
      './screenshots/execution-1-task-1-file-shot.png',
    );
    expect(mdContent).not.toContain(sourceScreenshotPath);
  });

  it('references the exported file name for report-relative screenshots', async () => {
    // Reproduces the exact issue #2392 scenario: the android
    // html-and-external-assets mode stores screenshots as
    // ./screenshots/<id>.png relative to the report file. The exported markdown
    // must point at the prefixed copy, not the original relative path.
    const reportDir = join(tmpDir, 'input-report-md-rel');
    const reportPath = join(reportDir, 'index.html');
    const sourceScreenshotsDir = join(reportDir, 'screenshots');
    mkdirSync(sourceScreenshotsDir, { recursive: true });

    const sourceScreenshotPath = join(sourceScreenshotsDir, 'rel-shot.png');
    writeFileSync(sourceScreenshotPath, Buffer.from('png-binary-rel'));

    const screenshotRef: ScreenshotRef = {
      type: 'midscene_screenshot_ref',
      id: 'rel-shot',
      capturedAt: Date.now(),
      mimeType: 'image/png',
      storage: 'file',
      path: './screenshots/rel-shot.png',
    };
    const dump = new ReportActionDump({
      groupName: 'markdown-rel-file-test',
      groupDescription: 'markdown export relative file ref test',
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution('exec-md-rel', screenshotRef)],
    });

    writeFileSync(
      reportPath,
      generateDumpScriptTag(dump.serialize(), { 'data-group-id': 'group-1' }),
      'utf-8',
    );

    const outputDir = join(tmpDir, 'output-md-rel');
    const [command] = createReportCliCommands();
    await command.def.handler({
      htmlPath: reportPath,
      outputDir,
      action: 'to-markdown',
    });

    const exportedScreenshot = join(
      outputDir,
      'screenshots',
      'execution-1-task-1-rel-shot.png',
    );
    expect(existsSync(exportedScreenshot)).toBe(true);
    expect(readFileSync(exportedScreenshot)).toEqual(
      readFileSync(sourceScreenshotPath),
    );

    // Markdown references the exported copy; the original relative path
    // ./screenshots/rel-shot.png must no longer appear on its own.
    const mdContent = readFileSync(join(outputDir, 'index.md'), 'utf-8');
    expect(mdContent).toContain(
      './screenshots/execution-1-task-1-rel-shot.png',
    );
    expect(mdContent).not.toContain('(./screenshots/rel-shot.png)');
  });

  function writeFakeReport(
    dirName: string,
    groupName: string,
    executionId: string,
  ): string {
    const reportPath = join(tmpDir, dirName, 'index.html');
    mkdirSync(join(tmpDir, dirName), { recursive: true });

    const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
    const dump = new ReportActionDump({
      groupName,
      groupDescription: `${groupName}-desc`,
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [createExecution(executionId, screenshot)],
    });

    const html = [
      generateImageScriptTag(screenshot.id, screenshot.base64),
      generateDumpScriptTag(dump.serialize(), {
        'data-group-id': `group-${executionId}`,
      }),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');
    return reportPath;
  }

  it('merges multiple reports via the JS SDK API', () => {
    const reportA = writeFakeReport('merge-input-a', 'group-A', 'exec-A');
    const reportB = writeFakeReport('merge-input-b', 'group-B', 'exec-B');

    const outputDir = join(tmpDir, 'merge-output-sdk');
    const result = mergeReportFiles({
      htmlPaths: [reportA, reportB],
      outputDir,
      outputName: 'merged-sdk',
    });

    expect(result.mergedReportPath.startsWith(outputDir)).toBe(true);
    expect(existsSync(result.mergedReportPath)).toBe(true);

    const merged = readFileSync(result.mergedReportPath, 'utf-8');
    const idMatches = merged.match(/playwright_test_id="[^"]+"/g) ?? [];
    expect(idMatches.length).toBe(2);
    expect(merged).toContain('group-A');
    expect(merged).toContain('group-B');
  });

  it('runs the merge action through the generic report command', async () => {
    const reportA = writeFakeReport('merge-cli-a', 'cli-group-A', 'exec-cli-A');
    const reportB = writeFakeReport('merge-cli-b', 'cli-group-B', 'exec-cli-B');

    const outputDir = join(tmpDir, 'merge-output-cli');
    const [command] = createReportCliCommands();
    const result = await command.def.handler({
      action: 'merge-html',
      htmlReport: [reportA, reportB],
      outputDir,
      outputName: 'merged-cli',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Merged 2 report(s) into');

    const mergedPath = join(outputDir, 'merged-cli.html');
    expect(existsSync(mergedPath)).toBe(true);
  });

  it('accepts a single --htmlReport for the merge action', async () => {
    const reportA = writeFakeReport(
      'merge-single-a',
      'single-group-A',
      'exec-single-A',
    );

    const outputDir = join(tmpDir, 'merge-output-single');
    const [command] = createReportCliCommands();
    const result = await command.def.handler({
      action: 'merge-html',
      htmlReport: reportA,
      outputDir,
      outputName: 'merged-single',
    });

    expect(result.isError).toBe(false);
    const mergedPath = join(outputDir, 'merged-single.html');
    expect(existsSync(mergedPath)).toBe(true);
  });

  it('throws when --htmlReport is missing for the merge action', async () => {
    const [command] = createReportCliCommands();

    await expect(
      command.def.handler({
        action: 'merge-html',
        outputDir: join(tmpDir, 'merge-missing'),
      }),
    ).rejects.toThrow('report-tool: --htmlReport is required');
  });

  it('drives the merge action end-to-end through runToolsCLI argv', async () => {
    const reportA = writeFakeReport('merge-e2e-a', 'e2e-group-A', 'exec-e2e-A');
    const reportB = writeFakeReport('merge-e2e-b', 'e2e-group-B', 'exec-e2e-B');

    const outputDir = join(tmpDir, 'merge-output-e2e');
    const [command] = createReportCliCommands();

    const restArgs = [
      '--action',
      'merge-html',
      '--htmlReport',
      reportA,
      '--htmlReport',
      reportB,
      '--outputDir',
      outputDir,
      '--outputName',
      'merged-e2e',
    ];
    expect(parseCliArgs(restArgs)).toEqual({
      action: 'merge-html',
      htmlReport: [reportA, reportB],
      outputDir,
      outputName: 'merged-e2e',
    });

    const logs: string[] = [];
    const consoleSpy = rs
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => String(a)).join(' '));
      });

    const tools = {
      initTools: rs.fn().mockResolvedValue(undefined),
      destroy: rs.fn().mockResolvedValue(undefined),
      getToolDefinitions: rs.fn().mockReturnValue([]),
    } as any;

    await runToolsCLI(tools, 'midscene-test', {
      argv: ['report-tool', ...restArgs],
      extraCommands: [command],
    });

    consoleSpy.mockRestore();

    const mergedPath = join(outputDir, 'merged-e2e.html');
    expect(existsSync(mergedPath)).toBe(true);
    expect(logs.join('\n')).toContain('Merged 2 report(s) into');
  });

  it('throws when merge target already exists without --overwrite', async () => {
    const reportA = writeFakeReport('merge-ow-a', 'ow-A', 'exec-ow-A');
    const outputDir = join(tmpDir, 'merge-output-overwrite');

    mergeReportFiles({
      htmlPaths: [reportA],
      outputDir,
      outputName: 'merged-ow',
    });

    expect(() =>
      mergeReportFiles({
        htmlPaths: [reportA],
        outputDir,
        outputName: 'merged-ow',
      }),
    ).toThrow('Report file already exists');

    const second = mergeReportFiles({
      htmlPaths: [reportA],
      outputDir,
      outputName: 'merged-ow',
      overwrite: true,
    });
    expect(existsSync(second.mergedReportPath)).toBe(true);
  });
});
