import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateDumpScriptTag, generateImageScriptTag } from '../../src/dump';
import { createReportCliCommands } from '../../src/report-cli';
import { inspectReport, inspectReportFile } from '../../src/report-inspection';
import { ScreenshotItem } from '../../src/screenshot-item';
import { ExecutionDump, ReportActionDump } from '../../src/types';

type TaskShape = {
  status: 'pending' | 'running' | 'finished' | 'failed' | 'cancelled';
  subType?: string;
  errorMessage?: string;
  output?: unknown;
  screenshot?: ScreenshotItem;
};

function buildExecution(id: string, tasks: TaskShape[]): ExecutionDump {
  return new ExecutionDump({
    id,
    logTime: Date.now(),
    name: `execution-${id}`,
    tasks: tasks.map((task, index) => ({
      taskId: `task-${id}-${index}`,
      type: 'Insight',
      subType: task.subType ?? 'Locate',
      param: { prompt: 'inspect report' },
      executor: async () => undefined,
      recorder: [],
      status: task.status,
      ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
      ...('output' in task ? { output: task.output } : {}),
      ...(task.screenshot
        ? {
            uiContext: {
              screenshot: task.screenshot,
              shotSize: { width: 1280, height: 720 },
              shrunkShotToLogicalRatio: 1,
            },
          }
        : {}),
    })) as any,
  });
}

function buildDump(executions: ExecutionDump[]): ReportActionDump {
  return new ReportActionDump({
    groupName: 'inspection-test',
    groupDescription: 'inspection test report',
    sdkVersion: '1.0.0-test',
    modelBriefs: [],
    executions,
  });
}

describe('inspectReportFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `midscene-report-inspection-${Date.now()}-${Math.random()}`,
    );
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function writeReport(
    dumps: ReportActionDump[],
    reportDirName = 'report',
    screenshots: ScreenshotItem[] = [],
  ): string {
    const reportDir = join(tmpDir, reportDirName);
    const reportPath = join(reportDir, 'index.html');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      reportPath,
      [
        ...screenshots.map((screenshot) =>
          generateImageScriptTag(screenshot.id, screenshot.base64),
        ),
        ...dumps.map((dump) =>
          generateDumpScriptTag(dump.serialize(), {
            'data-group-id': 'inspection-group',
          }),
        ),
      ].join('\n'),
      'utf-8',
    );
    return reportPath;
  }

  it('classifies a failed report from the shared task-icon rules', () => {
    const reportPath = writeReport([
      buildDump([
        buildExecution('failed', [
          { status: 'finished' },
          { status: 'finished', subType: 'Assert', output: false },
        ]),
      ]),
    ]);

    const result = inspectReportFile({ htmlPath: reportPath });

    expect(result).toEqual({
      schemaVersion: 2,
      report: reportPath,
      reportStatus: 'fail',
    });
    expect(result).not.toHaveProperty('failedTasks');
    expect(result).not.toHaveProperty('incompleteTasks');
  });

  it('does not expose task summaries', async () => {
    const reportPath = writeReport([
      buildDump([
        buildExecution('first', [
          { status: 'failed', errorMessage: 'first failure' },
        ]),
        buildExecution('second', [
          { status: 'finished', subType: 'Assert', output: false },
          { status: 'finished', errorMessage: 'third failure' },
        ]),
      ]),
    ]);

    const result = await inspectReport({ report: reportPath });

    expect(result.reportStatus).toBe('fail');
    expect(result).not.toHaveProperty('failedTasks');
    expect(result).not.toHaveProperty('incompleteTasks');
    expect(result).not.toHaveProperty('reportSummary');
  });

  it('uses the last task icon even when an earlier task failed', async () => {
    const reportPath = writeReport([
      buildDump([
        buildExecution('mixed', [
          { status: 'failed', errorMessage: 'recorded failure' },
          { status: 'running' },
        ]),
      ]),
    ]);

    const result = await inspectReport({ report: reportPath });

    expect(result.reportStatus).toBe('incomplete');
  });

  it.each([
    [{ status: 'finished' }, 'pass'],
    [{ status: 'finished', subType: 'WaitFor', output: false }, 'pass'],
    [{ status: 'failed' }, 'fail'],
    [{ status: 'cancelled' }, 'incomplete'],
  ] as const)(
    'maps the final task icon %s independently from earlier failures',
    async (finalTask, reportStatus) => {
      const reportPath = writeReport([
        buildDump([
          buildExecution('last-task-wins', [
            { status: 'failed', errorMessage: 'earlier failure' },
            { ...finalTask },
          ]),
        ]),
      ]);

      const result = await inspectReport({ report: reportPath });

      expect(result.reportStatus).toBe(reportStatus);
      expect(result).not.toHaveProperty('failedTasks');
      expect(result).not.toHaveProperty('incompleteTasks');
      expect(result).not.toHaveProperty('reportSummary');
      expect(result).not.toHaveProperty('lastTaskStatus');
      expect(result).not.toHaveProperty('analysisRoute');
    },
  );

  it('treats a WaitFor false result as a passing report with a warning', () => {
    const reportPath = writeReport([
      buildDump([
        buildExecution('warning', [
          { status: 'finished', subType: 'WaitFor', output: false },
        ]),
      ]),
    ]);

    const result = inspectReportFile({ htmlPath: reportPath });

    expect(result).toEqual({
      schemaVersion: 2,
      report: reportPath,
      reportStatus: 'pass',
    });
  });

  it.each(['pending', 'running', 'cancelled'] as const)(
    'classifies a final %s task as incomplete',
    (status) => {
      const reportPath = writeReport([
        buildDump([buildExecution(status, [{ status }])]),
      ]);

      const result = inspectReportFile({ htmlPath: reportPath });

      expect(result.reportStatus).toBe('incomplete');
    },
  );

  it('returns incomplete when the report has no tasks', async () => {
    const reportPath = writeReport([buildDump([buildExecution('empty', [])])]);

    const result = inspectReportFile({ htmlPath: reportPath });

    expect(result.reportStatus).toBe('incomplete');

    const publicResult = await inspectReport({ report: reportPath });
    expect(publicResult).toEqual(
      expect.objectContaining({
        reportStatus: 'incomplete',
      }),
    );
  });

  it('classifies an unreliable final task as incomplete', async () => {
    const reportPath = writeReport([
      buildDump([
        buildExecution('unreliable', [
          { status: 'finished' as TaskShape['status'] },
        ]),
      ]),
    ]);
    const raw = readFileSync(reportPath, 'utf8').replace(
      '"status":"finished"',
      '"status":"mystery"',
    );
    writeFileSync(reportPath, raw, 'utf8');

    const result = inspectReportFile({ htmlPath: reportPath });
    expect(result.reportStatus).toBe('incomplete');

    const publicResult = await inspectReport({ report: reportPath });
    expect(publicResult.reportStatus).toBe('incomplete');
    expect(publicResult).not.toHaveProperty('incompleteTasks');
  });

  it('keeps only the latest snapshot of an execution id', async () => {
    const reportPath = writeReport([
      buildDump([
        buildExecution('deduped', [
          { status: 'failed', errorMessage: 'recovered failure' },
        ]),
      ]),
      buildDump([buildExecution('deduped', [{ status: 'finished' }])]),
    ]);

    const result = await inspectReport({ report: reportPath });

    expect(result.reportStatus).toBe('pass');
  });

  it.each([
    ['partial opening tag', '<script type="midscene_web_du'],
    [
      'opening tag',
      '<script type="midscene_web_dump" data-group-id="inspection-group"',
    ],
    [
      'script content',
      '<script type="midscene_web_dump" data-group-id="inspection-group">{"groupName":',
    ],
  ])(
    'rejects truncated trailing dump %s instead of using the previous snapshot',
    async (_scenario, truncatedDump) => {
      const reportPath = writeReport([
        buildDump([buildExecution('stale', [{ status: 'finished' }])]),
      ]);
      appendFileSync(reportPath, `\n${truncatedDump}`, 'utf-8');

      expect(() => inspectReportFile({ htmlPath: reportPath })).toThrow(
        'Report dump is truncated or incomplete',
      );

      await expect(inspectReport({ report: reportPath })).rejects.toThrow(
        'Report dump is truncated or incomplete',
      );
    },
  );

  it('accepts an unclosed dump tag when its JSON content is complete', () => {
    const reportPath = writeReport([
      buildDump([buildExecution('stale', [{ status: 'finished' }])]),
    ]);
    const completeDump = buildDump([
      buildExecution('newer', [{ status: 'failed' }]),
    ]).serialize();
    expect(() => JSON.parse(completeDump)).not.toThrow();

    appendFileSync(
      reportPath,
      `\n<script type="midscene_web_dump" data-group-id="inspection-group">${completeDump}`,
      'utf-8',
    );

    const result = inspectReportFile({ htmlPath: reportPath });

    expect(result.reportStatus).toBe('fail');
  });

  it('accepts a report directory and exposes JSON through the CLI action', async () => {
    const reportPath = writeReport([
      buildDump([buildExecution('cli', [{ status: 'finished' }])]),
    ]);
    const reportDir = join(reportPath, '..');
    const outputDir = join(tmpDir, 'inspect-output');
    const [command] = createReportCliCommands();

    const response = await command.def.handler({
      action: 'inspect',
      htmlPath: reportDir,
      outputDir,
    });
    const result = JSON.parse(response.content[0].text);

    expect(response.isError).toBe(false);
    expect(Object.keys(result).sort()).toEqual(
      [
        'localReport',
        'markdownFiles',
        'report',
        'reportStatus',
        'schemaVersion',
      ].sort(),
    );
    expect(result.report).toBe(reportDir);
    expect(result.localReport).toBe(reportPath);
    expect(result.reportStatus).toBe('pass');
    expect(result.markdownFiles).toEqual([join(outputDir, 'index.md')]);
    expect(result).not.toHaveProperty('failedTasks');
    expect(result).not.toHaveProperty('incompleteTasks');
    expect(result).not.toHaveProperty('reportSummary');
    expect(result).not.toHaveProperty('lastTaskStatus');
    expect(result).not.toHaveProperty('analysisRoute');
    expect(result).not.toHaveProperty('screenshotFiles');
    expect(existsSync(result.markdownFiles[0])).toBe(true);
  });

  it('uses a cross-platform temporary directory for inspect exports by default', async () => {
    const reportPath = writeReport([
      buildDump([buildExecution('cli-temp', [{ status: 'finished' }])]),
    ]);
    const [command] = createReportCliCommands();

    const response = await command.def.handler({
      action: 'inspect',
      htmlPath: reportPath,
    });
    const result = JSON.parse(response.content[0].text);
    const outputDir = dirname(result.markdownFiles[0]);

    try {
      expect(result.reportStatus).toBe('pass');
      expect(result.markdownFiles).toEqual([join(outputDir, 'index.md')]);
      expect(outputDir).toContain('midscene-report-inspect-');
      expect(existsSync(result.markdownFiles[0])).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('exports partial evidence for parseable incomplete reports', async () => {
    const screenshot = ScreenshotItem.create(
      `data:image/png;base64,${'A'.repeat(100)}`,
      Date.now(),
    );
    const reportPath = writeReport(
      [
        buildDump([
          buildExecution('cli-unknown', [{ status: 'running', screenshot }]),
        ]),
      ],
      'report',
      [screenshot],
    );
    const outputDir = join(tmpDir, 'unknown-output');
    const [command] = createReportCliCommands();

    const response = await command.def.handler({
      action: 'inspect',
      htmlPath: reportPath,
      outputDir,
    });
    const result = JSON.parse(response.content[0].text);

    expect(result.schemaVersion).toBe(3);
    expect(result.reportStatus).toBe('incomplete');
    expect(result.markdownFiles).toEqual([join(outputDir, 'index.md')]);
    expect(result).not.toHaveProperty('failedTasks');
    expect(result).not.toHaveProperty('incompleteTasks');
    expect(result).not.toHaveProperty('reportSummary');
    expect(result).not.toHaveProperty('lastTaskStatus');
    expect(result).not.toHaveProperty('analysisRoute');
    expect(result).not.toHaveProperty('screenshotFiles');
    expect(existsSync(result.markdownFiles[0])).toBe(true);
    const markdown = readFileSync(result.markdownFiles[0], 'utf8');
    expect(markdown).toContain('screenshots/');
    expect(readdirSync(join(outputDir, 'screenshots'))).toHaveLength(1);
  });

  it('throws through the CLI for unavailable reports', async () => {
    const missingPath = join(tmpDir, 'missing-for-cli.html');
    const outputDir = join(tmpDir, 'missing-output');
    const [command] = createReportCliCommands();

    await expect(
      command.def.handler({
        action: 'inspect',
        htmlPath: missingPath,
        outputDir,
      }),
    ).rejects.toThrow();
    expect(existsSync(outputDir)).toBe(false);
  });

  it('throws for missing or unparseable report files', () => {
    expect(() => inspectReportFile({ htmlPath: '' })).toThrow(
      'inspectReportFile: htmlPath is required',
    );
    expect(() =>
      inspectReportFile({ htmlPath: join(tmpDir, 'missing.html') }),
    ).toThrow('Report path does not exist');

    const invalidPath = join(tmpDir, 'invalid.html');
    writeFileSync(invalidPath, '<html>no report dump</html>', 'utf-8');
    expect(() => inspectReportFile({ htmlPath: invalidPath })).toThrow(
      'No report dump scripts found',
    );
  });

  it('throws for report-specific input problems', async () => {
    const missingPath = join(tmpDir, 'missing.html');
    await expect(inspectReport({ report: missingPath })).rejects.toThrow();

    const invalidPath = join(tmpDir, 'invalid-public.html');
    writeFileSync(invalidPath, '<html>no report dump</html>', 'utf8');
    await expect(inspectReport({ report: invalidPath })).rejects.toThrow(
      'No report dump scripts found',
    );
  });

  it('materializes a report URL while preserving the supplied URL', async () => {
    const sourcePath = writeReport([
      buildDump([buildExecution('url', [{ status: 'finished' }])]),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(readFileSync(sourcePath), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );

    const reportUrl = 'https://example.test/report.html?case=url';
    const result = await inspectReport({ report: reportUrl });
    try {
      expect(result.report).toBe(reportUrl);
      expect(result.localReport).toMatch(/midscene-report-.*report\.html$/);
      expect(result.reportStatus).toBe('pass');
    } finally {
      if (result.localReport) {
        rmSync(dirname(result.localReport), { recursive: true, force: true });
      }
    }
  });
});
