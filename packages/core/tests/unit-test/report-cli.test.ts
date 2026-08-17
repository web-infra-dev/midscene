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
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadExtraActions } from '../../src/agent/extra-actions';
import { getMidsceneLocationSchema } from '../../src/ai-model';
import { generateDumpScriptTag, generateImageScriptTag } from '../../src/dump';
import type { ScreenshotRef } from '../../src/dump/screenshot-store';
import { analyzeReportActions } from '../../src/report-analyzer';
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

function createActionExecution(options?: {
  xpath?: string;
  includeFailedAction?: boolean;
  extraActionName?: string;
}): ExecutionDump {
  const locateHitBy = options?.xpath
    ? {
        from: 'Plan',
        context: {
          locatedPixelBbox: [10, 20, 110, 70],
          cacheToSave: {
            targets: [{ strategy: 'xpath', selector: options.xpath }],
          },
        },
      }
    : {
        from: 'Plan',
        context: {
          locatedPixelBbox: [10, 20, 110, 70],
        },
      };

  const tasks = [
    {
      taskId: 'plan-tap',
      type: 'Planning',
      subType: 'Plan',
      param: {},
      output: {
        log: 'Click the confirm button',
        actions: [
          {
            type: 'Tap',
            thought: 'Click the confirm button',
          },
        ],
      },
      executor: async () => undefined,
      status: 'finished',
    },
    {
      taskId: 'locate-confirm',
      type: 'Planning',
      subType: 'Locate',
      param: {
        prompt: 'Confirm button',
        locatedPixelBbox: [10, 20, 110, 70],
      },
      hitBy: locateHitBy,
      executor: async () => undefined,
      status: 'finished',
    },
    {
      taskId: 'tap-confirm',
      type: 'Action Space',
      subType: 'Tap',
      param: {
        locate: {
          description: 'Confirm button',
          rect: { left: 10, top: 20, width: 100, height: 50 },
          center: [60, 45],
        },
      },
      ...(options?.extraActionName
        ? {
            hitBy: {
              from: 'Extra Action',
              context: {
                extraActionName: options.extraActionName,
                extraActionAlias: 'MidsceneExtraAction_1',
              },
            },
          }
        : {}),
      executor: async () => undefined,
      status: 'finished',
    },
    {
      taskId: 'plan-input',
      type: 'Planning',
      subType: 'Plan',
      param: {},
      output: {
        log: 'Type the saved value',
        actions: [
          {
            type: 'Input',
            thought: 'Type the saved value',
          },
        ],
      },
      executor: async () => undefined,
      status: 'finished',
    },
    {
      taskId: 'input-value',
      type: 'Action Space',
      subType: 'Input',
      param: {
        value: 'saved value',
      },
      executor: async () => undefined,
      status: 'finished',
    },
    ...(options?.includeFailedAction
      ? [
          {
            taskId: 'failed-tap',
            type: 'Action Space',
            subType: 'Tap',
            param: {},
            executor: async () => undefined,
            status: 'failed',
          },
        ]
      : []),
    {
      taskId: 'finished-marker',
      type: 'Action Space',
      subType: 'Finished',
      param: null,
      executor: async () => undefined,
      status: 'finished',
    },
  ];

  return new ExecutionDump({
    id: 'action-execution',
    logTime: Date.now(),
    name: 'action execution',
    tasks: tasks as any,
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

  it('exposes report-tool and analyze as generic report commands', () => {
    const commands = createReportCliCommands();
    expect(commands.map((command) => command.name)).toEqual([
      'report-tool',
      'analyze',
    ]);
    expect(commands.every((command) => !('aliases' in command))).toBe(true);
  });

  it('exports successful device operations into one loadable Action Manifest', async () => {
    const reportPath = join(tmpDir, 'action-report.html');
    const report = new ReportActionDump({
      groupName: 'action-export',
      sdkVersion: '1.0.0-test',
      deviceType: 'web',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [
        createActionExecution({
          xpath: '/html/body/button[1]',
          includeFailedAction: true,
        }),
      ],
    });
    writeFileSync(
      reportPath,
      generateDumpScriptTag(report.serialize(), {
        'data-group-id': 'action-export',
      }),
      'utf-8',
    );

    const result = analyzeReportActions({ htmlPath: reportPath });

    expect(result.actionFiles.map((file) => file.split('/').pop())).toEqual([
      'action-report.actions.yaml',
    ]);
    expect(result.actionCount).toBe(2);
    expect(result.coordinateFallbackFiles).toEqual([]);
    expect(yaml.load(readFileSync(result.actionFiles[0], 'utf-8'))).toEqual({
      version: 1,
      interface: 'web',
      actions: [
        {
          name: 'Click the confirm button',
          validWhenTargetExists: {
            strategy: 'xpath',
            selector: '/html/body/button[1]',
          },
          action: {
            name: 'Tap',
            param: {
              locate: {
                prompt: 'Confirm button',
                target: {
                  strategy: 'xpath',
                  selector: '/html/body/button[1]',
                },
              },
            },
          },
        },
        {
          name: 'Type the saved value',
          action: {
            name: 'Input',
            param: { value: 'saved value' },
          },
        },
      ],
    });

    const loaded = await loadExtraActions(result.actionFiles, [
      {
        name: 'Tap',
        description: 'Tap an element',
        paramSchema: z.object({
          locate: getMidsceneLocationSchema(),
        }),
        call: async () => undefined,
      },
      {
        name: 'Input',
        description: 'Input text',
        paramSchema: z.object({
          value: z.string(),
        }),
        call: async () => undefined,
      },
    ]);
    expect(loaded.map((action) => action.plan)).toEqual([
      expect.objectContaining({
        type: 'Tap',
        param: {
          locate: {
            prompt: 'Confirm button',
            target: {
              strategy: 'xpath',
              selector: '/html/body/button[1]',
            },
          },
        },
      }),
      expect.objectContaining({
        type: 'Input',
        param: { value: 'saved value' },
      }),
    ]);
  });

  it('requires a canonical manifest interface instead of inferring one from deviceType', () => {
    const reportPath = join(tmpDir, 'missing-manifest-interface.html');
    const report = new ReportActionDump({
      groupName: 'missing-manifest-interface',
      sdkVersion: '1.0.0-test',
      deviceType: 'puppeteer',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [createActionExecution({ xpath: '//button' })],
    });
    const reportWithoutManifestInterface = {
      ...JSON.parse(report.serialize()),
      manifestInterface: undefined,
    };
    writeFileSync(
      reportPath,
      generateDumpScriptTag(JSON.stringify(reportWithoutManifestInterface), {
        'data-group-id': 'missing-manifest-interface',
      }),
      'utf-8',
    );

    expect(() => analyzeReportActions({ htmlPath: reportPath })).toThrow(
      'manifestInterface must be a non-empty string',
    );
  });

  it('rejects reports that combine executions from different manifest interfaces', () => {
    const reportPath = join(tmpDir, 'mixed-manifest-interfaces.html');
    const webReport = new ReportActionDump({
      groupName: 'web-actions',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [createActionExecution({ xpath: '//button[@id="web"]' })],
    });
    const androidReport = new ReportActionDump({
      groupName: 'android-actions',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'android',
      modelBriefs: [],
      executions: [createActionExecution({ xpath: '//button[@id="android"]' })],
    });
    writeFileSync(
      reportPath,
      [
        generateDumpScriptTag(webReport.serialize(), {
          'data-group-id': 'web-actions',
        }),
        generateDumpScriptTag(androidReport.serialize(), {
          'data-group-id': 'android-actions',
        }),
      ].join('\n'),
      'utf-8',
    );

    expect(() => analyzeReportActions({ htmlPath: reportPath })).toThrow(
      'received ["web","android"]',
    );
  });

  it('does not pair a failed locate from an earlier plan with a recovered action', () => {
    const reportPath = join(tmpDir, 'recovered-locate.html');
    const execution = new ExecutionDump({
      id: 'recovered-locate',
      logTime: Date.now(),
      name: 'recovered locate',
      tasks: [
        {
          taskId: 'wrong-plan',
          type: 'Planning',
          subType: 'Plan',
          param: {},
          output: {
            log: 'Try the wrong button',
            actions: [{ type: 'Tap', thought: 'Try the wrong button' }],
          },
          status: 'finished',
        },
        {
          taskId: 'wrong-locate',
          type: 'Planning',
          subType: 'Locate',
          param: {
            prompt: 'Wrong button',
            target: {
              strategy: 'xpath',
              selector: '//button[@id="wrong"]',
            },
          },
          status: 'failed',
        },
        {
          taskId: 'recovery-plan',
          type: 'Planning',
          subType: 'Plan',
          param: {},
          output: {
            log: 'Click the correct button',
            actions: [{ type: 'Tap', thought: 'Click the correct button' }],
          },
          status: 'finished',
        },
        {
          taskId: 'correct-locate',
          type: 'Planning',
          subType: 'Locate',
          param: {
            prompt: 'Correct button',
            target: {
              strategy: 'xpath',
              selector: '//button[@id="correct"]',
            },
          },
          status: 'finished',
        },
        {
          taskId: 'correct-action',
          type: 'Action Space',
          subType: 'Tap',
          param: {
            locate: {
              description: 'Correct button',
              rect: { left: 10, top: 20, width: 100, height: 50 },
              center: [60, 45],
            },
          },
          status: 'finished',
        },
      ] as any,
    });
    const report = new ReportActionDump({
      groupName: 'recovered-locate',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [execution],
    });
    writeFileSync(
      reportPath,
      generateDumpScriptTag(report.serialize(), {
        'data-group-id': 'recovered-locate',
      }),
      'utf-8',
    );

    const result = analyzeReportActions({ htmlPath: reportPath });
    const manifest = yaml.load(
      readFileSync(result.actionFiles[0], 'utf-8'),
    ) as any;
    expect(manifest.actions).toHaveLength(1);
    expect(manifest.actions[0]).toMatchObject({
      name: 'Click the correct button',
      validWhenTargetExists: {
        strategy: 'xpath',
        selector: '//button[@id="correct"]',
      },
      action: {
        param: {
          locate: {
            target: {
              strategy: 'xpath',
              selector: '//button[@id="correct"]',
            },
          },
        },
      },
    });
  });

  it('exports the fallback target after a supplied target fails to resolve', () => {
    const reportPath = join(tmpDir, 'target-fallback.html');
    const failedTarget = {
      strategy: 'xpath' as const,
      selector: '//button[@id="missing"]',
    };
    const fallbackTarget = {
      strategy: 'xpath' as const,
      selector: '//button[@id="actual"]',
    };
    const execution = new ExecutionDump({
      id: 'target-fallback',
      logTime: Date.now(),
      name: 'target fallback',
      tasks: [
        {
          taskId: 'plan',
          type: 'Planning',
          subType: 'Plan',
          param: {},
          output: {
            actions: [
              { type: 'Tap', thought: 'Click the actual fallback button' },
            ],
          },
          status: 'finished',
        },
        {
          taskId: 'locate',
          type: 'Planning',
          subType: 'Locate',
          param: {
            prompt: 'Actual fallback button',
            target: failedTarget,
          },
          hitBy: {
            from: 'AI',
            context: {
              target: failedTarget,
              targetResolutionError: 'XPath target does not exist',
              cacheToSave: { targets: [fallbackTarget] },
            },
          },
          status: 'finished',
        },
        {
          taskId: 'action',
          type: 'Action Space',
          subType: 'Tap',
          param: {
            locate: {
              description: 'Actual fallback button',
              rect: { left: 10, top: 20, width: 100, height: 50 },
              center: [60, 45],
            },
          },
          status: 'finished',
        },
      ] as any,
    });
    const report = new ReportActionDump({
      groupName: 'target-fallback',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [execution],
    });
    writeFileSync(
      reportPath,
      generateDumpScriptTag(report.serialize(), {
        'data-group-id': 'target-fallback',
      }),
      'utf-8',
    );

    const result = analyzeReportActions({ htmlPath: reportPath });
    const manifest = yaml.load(
      readFileSync(result.actionFiles[0], 'utf-8'),
    ) as any;
    expect(manifest.actions[0]).toMatchObject({
      validWhenTargetExists: fallbackTarget,
      action: {
        param: {
          locate: {
            target: fallbackTarget,
          },
        },
      },
    });
  });

  it('uses each planned action thought when one plan contains multiple actions', () => {
    const reportPath = join(tmpDir, 'multi-action-plan.html');
    const locatedElement = (description: string) => ({
      description,
      rect: { left: 10, top: 20, width: 100, height: 50 },
      center: [60, 45],
    });
    const execution = new ExecutionDump({
      id: 'multi-action-plan',
      logTime: Date.now(),
      name: 'multi action plan',
      tasks: [
        {
          taskId: 'plan',
          type: 'Planning',
          subType: 'Plan',
          param: {},
          output: {
            log: 'Complete both operations',
            actions: [
              { type: 'Tap', thought: 'Click the primary button' },
              { type: 'Input', thought: 'Enter the saved value' },
            ],
          },
          status: 'finished',
        },
        {
          taskId: 'locate-primary',
          type: 'Planning',
          subType: 'Locate',
          param: {
            prompt: 'Primary button',
            target: {
              strategy: 'xpath',
              selector: '//button[@id="primary"]',
            },
          },
          status: 'finished',
        },
        {
          taskId: 'tap-primary',
          type: 'Action Space',
          subType: 'Tap',
          param: { locate: locatedElement('Primary button') },
          status: 'finished',
        },
        {
          taskId: 'locate-input',
          type: 'Planning',
          subType: 'Locate',
          param: {
            prompt: 'Saved value input',
            target: {
              strategy: 'xpath',
              selector: '//input[@id="saved"]',
            },
          },
          status: 'finished',
        },
        {
          taskId: 'input-value',
          type: 'Action Space',
          subType: 'Input',
          param: {
            value: 'saved value',
            locate: locatedElement('Saved value input'),
          },
          status: 'finished',
        },
      ] as any,
    });
    const report = new ReportActionDump({
      groupName: 'multi-action-plan',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [execution],
    });
    writeFileSync(
      reportPath,
      generateDumpScriptTag(report.serialize(), {
        'data-group-id': 'multi-action-plan',
      }),
      'utf-8',
    );

    const result = analyzeReportActions({ htmlPath: reportPath });
    const manifest = yaml.load(
      readFileSync(result.actionFiles[0], 'utf-8'),
    ) as any;
    expect(manifest.actions.map((action: any) => action.name)).toEqual([
      'Click the primary button',
      'Enter the saved value',
    ]);
  });

  it('uses the first of multiple action targets as the disclosure condition', () => {
    const reportPath = join(tmpDir, 'multi-target-swipe.html');
    const startTarget = {
      strategy: 'xpath' as const,
      selector: '//div[@id="slider-handle"]',
    };
    const endTarget = {
      strategy: 'xpath' as const,
      selector: '//div[@id="slider-end"]',
    };
    const locatedElement = (description: string, left: number) => ({
      description,
      rect: { left, top: 20, width: 20, height: 20 },
      center: [left + 10, 30],
    });
    const execution = new ExecutionDump({
      id: 'multi-target-swipe',
      logTime: Date.now(),
      name: 'multi target swipe',
      tasks: [
        {
          taskId: 'plan',
          type: 'Planning',
          subType: 'Plan',
          param: {},
          output: {
            actions: [{ type: 'Swipe', thought: 'Move the slider to the end' }],
          },
          status: 'finished',
        },
        {
          taskId: 'locate-start',
          type: 'Planning',
          subType: 'Locate',
          param: { prompt: 'Slider handle', target: startTarget },
          status: 'finished',
        },
        {
          taskId: 'locate-end',
          type: 'Planning',
          subType: 'Locate',
          param: { prompt: 'Slider end', target: endTarget },
          status: 'finished',
        },
        {
          taskId: 'swipe',
          type: 'Action Space',
          subType: 'Swipe',
          param: {
            start: locatedElement('Slider handle', 10),
            end: locatedElement('Slider end', 200),
            duration: 300,
          },
          status: 'finished',
        },
      ] as any,
    });
    const report = new ReportActionDump({
      groupName: 'multi-target-swipe',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [execution],
    });
    writeFileSync(
      reportPath,
      generateDumpScriptTag(report.serialize(), {
        'data-group-id': 'multi-target-swipe',
      }),
      'utf-8',
    );

    const result = analyzeReportActions({ htmlPath: reportPath });
    const manifest = yaml.load(
      readFileSync(result.actionFiles[0], 'utf-8'),
    ) as any;
    expect(manifest.actions[0]).toMatchObject({
      validWhenTargetExists: startTarget,
      action: {
        name: 'Swipe',
        param: {
          start: { target: startTarget },
          end: { target: endTarget },
          duration: 300,
        },
      },
    });
  });

  it('preserves the recorded Extra Action name when exporting a replay report', () => {
    const reportPath = join(tmpDir, 'replayed-extra-action.html');
    const report = new ReportActionDump({
      groupName: 'replayed-extra-action',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [
        createActionExecution({
          xpath: '//button',
          extraActionName: 'Recorded checkout confirmation',
        }),
      ],
    });
    writeFileSync(
      reportPath,
      generateDumpScriptTag(report.serialize(), {
        'data-group-id': 'replayed-extra-action',
      }),
      'utf-8',
    );

    const result = analyzeReportActions({ htmlPath: reportPath });
    const manifest = yaml.load(
      readFileSync(result.actionFiles[0], 'utf-8'),
    ) as any;
    expect(manifest.actions[0].name).toBe('Recorded checkout confirmation');
  });

  it('falls back to locatedPixelBbox for reports without a recorded xpath', () => {
    const reportPath = join(tmpDir, 'historical-report.html');
    const report = new ReportActionDump({
      groupName: 'historical-action-export',
      sdkVersion: '1.0.0-test',
      deviceType: 'web',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [createActionExecution()],
    });
    writeFileSync(
      reportPath,
      generateDumpScriptTag(report.serialize(), {
        'data-group-id': 'historical-action-export',
      }),
      'utf-8',
    );

    const result = analyzeReportActions({ htmlPath: reportPath });
    const manifest = yaml.load(
      readFileSync(result.actionFiles[0], 'utf-8'),
    ) as any;

    expect(result.coordinateFallbackFiles).toEqual([result.actionFiles[0]]);
    expect(result.coordinateFallbackActionCount).toBe(1);
    expect(manifest.actions[0].action.param.locate).toEqual({
      prompt: 'Confirm button',
      locatedPixelBbox: [10, 20, 110, 70],
    });
  });

  it('does not overwrite generated UI Actions unless requested', () => {
    const reportPath = join(tmpDir, 'overwrite-report.html');
    const report = new ReportActionDump({
      groupName: 'overwrite-action-export',
      sdkVersion: '1.0.0-test',
      deviceType: 'web',
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [createActionExecution({ xpath: '//button' })],
    });
    writeFileSync(
      reportPath,
      generateDumpScriptTag(report.serialize(), {
        'data-group-id': 'overwrite-action-export',
      }),
      'utf-8',
    );

    const first = analyzeReportActions({ htmlPath: reportPath });
    expect(() => analyzeReportActions({ htmlPath: reportPath })).toThrow(
      'output file already exists',
    );
    expect(() =>
      analyzeReportActions({ htmlPath: reportPath, overwrite: true }),
    ).not.toThrow();
    expect(existsSync(first.actionFiles[0])).toBe(true);
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
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [createExecution('exec-1', screenshot1)],
    });
    const dump2 = new ReportActionDump({
      groupName: 'split-test',
      groupDescription: 'split-test',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
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
      manifestInterface: 'web',
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
    const reportPath = join(tmpDir, 'input-report-sdk-md', 'index.html');
    mkdirSync(join(tmpDir, 'input-report-sdk-md'), { recursive: true });

    const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
    const dump = new ReportActionDump({
      groupName: 'sdk-markdown-test',
      groupDescription: 'sdk markdown test',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
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
      manifestInterface: 'web',
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
      'report-tool: unsupported --action value "invalid-action". Currently supported: split, to-markdown, merge-html',
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
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [createExecution('exec-md-1', screenshot1)],
    });
    const dump2 = new ReportActionDump({
      groupName: 'markdown-test',
      groupDescription: 'markdown export test',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
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
      manifestInterface: 'web',
      modelBriefs: [],
      executions: [createExecution('exec-md-dedup', oldScreenshot)],
    });
    const newDump = new ReportActionDump({
      groupName: 'markdown-dedup-test',
      groupDescription: 'markdown export dedup test',
      sdkVersion: '1.0.0-test',
      manifestInterface: 'web',
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
      manifestInterface: 'web',
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
    const mdContent = readFileSync(join(outputDir, 'report.md'), 'utf-8');
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
      manifestInterface: 'web',
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
    const mdContent = readFileSync(join(outputDir, 'report.md'), 'utf-8');
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
      manifestInterface: 'web',
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
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => String(a)).join(' '));
      });

    const tools = {
      initTools: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      getToolDefinitions: vi.fn().mockReturnValue([]),
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
