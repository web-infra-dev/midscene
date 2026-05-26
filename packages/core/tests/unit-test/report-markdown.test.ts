import { describe, expect, it } from 'vitest';
import {
  executionToMarkdown,
  reportToMarkdown,
} from '../../src/report-markdown';
import { ScreenshotItem } from '../../src/screenshot-item';
import type { IExecutionDump, IReportActionDump } from '../../src/types';

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'task-1',
    type: 'Action Space',
    subType: 'Tap',
    status: 'finished',
    param: {
      locate: {
        prompt: 'Submit',
      },
    },
    executor: async () => {},
    timing: {
      start: 1710000000000,
      end: 1710000000100,
      cost: 100,
    },
    ...overrides,
  } as any;
}

describe('report-markdown', () => {
  it('handles single execution markdown with screenshot file links', () => {
    const screenshot = ScreenshotItem.create(
      'data:image/png;base64,Zm9v',
      1710000000000,
    );
    const execution: IExecutionDump = {
      logTime: 1710000000000,
      name: 'single execution',
      tasks: [
        createTask({
          uiContext: {
            screenshot,
            shotSize: { width: 1280, height: 720 },
          },
          recorder: [
            {
              type: 'screenshot',
              ts: 1710000000050,
              timing: 'after click',
              screenshot: {
                type: 'midscene_screenshot_ref',
                id: 'shot-recorder-single',
                capturedAt: 1710000000050,
                mimeType: 'image/png',
                storage: 'file',
                path: './screenshots/shot-recorder-single.png',
              },
            },
          ],
        }),
      ],
    };

    const result = executionToMarkdown(execution);

    expect(result.markdown).toContain('# single execution');
    expect(result.markdown).toContain('Tap - Submit');
    expect(result.markdown).toContain('![task-1](./screenshots/');
    expect(result.markdown).toContain('### Recorder');
    expect(result.markdown).toContain('timing=after click');
    expect(result.markdown).toContain('Screen size: 1280 x 720');
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0].filePath).toContain('./screenshots/');
    expect(result.attachments[0].suggestedFileName).toContain('.png');
  });

  it('merges all executions into one markdown and keeps file snapshot', async () => {
    const report: IReportActionDump = {
      sdkVersion: '1.0.0',
      groupName: 'report-group',
      modelBriefs: [],
      executions: [
        {
          logTime: 1710000000000,
          name: 'exec-1',
          tasks: [
            createTask({
              taskId: 'task-1',
              uiContext: {
                screenshot: {
                  type: 'midscene_screenshot_ref',
                  id: 'shot-exec-1',
                  capturedAt: 1710000000000,
                  mimeType: 'image/png',
                  storage: 'file',
                  path: './screenshots/shot-exec-1.png',
                },
                shotSize: { width: 1440, height: 900 },
              },
              recorder: [
                {
                  type: 'screenshot',
                  ts: 1710000000060,
                  timing: 'record-step-1',
                  screenshot: {
                    type: 'midscene_screenshot_ref',
                    id: 'shot-recorder-exec-1',
                    capturedAt: 1710000000060,
                    mimeType: 'image/png',
                    storage: 'file',
                    path: './screenshots/shot-recorder-exec-1.png',
                  },
                },
              ],
            }),
          ],
        },
        {
          logTime: 1710000000200,
          name: 'exec-2',
          tasks: [
            createTask({
              taskId: 'task-2',
              subType: 'Locate',
              output: {
                element: {
                  center: [512, 333],
                },
              },
              uiContext: {
                screenshot: {
                  type: 'midscene_screenshot_ref',
                  id: 'shot-exec-2',
                  capturedAt: 1710000000200,
                  mimeType: 'image/png',
                  storage: 'file',
                  path: './screenshots/shot-exec-2.png',
                },
                shotSize: { width: 1024, height: 768 },
              },
            }),
          ],
        },
      ],
    };

    const result = reportToMarkdown(report);

    expect(result.markdown).toContain('# report-group');
    expect(result.markdown).toContain('# exec-1');
    expect(result.markdown).toContain('# exec-2');
    expect(result.markdown).toContain('Suggested execution markdown files');
    expect(result.markdown).toContain('timing=record-step-1');
    expect(result.markdown).toContain('Screen size: 1440 x 900');
    expect(result.markdown).toContain('Screen size: 1024 x 768');
    expect(result.markdown).toContain('Locate center: (512, 333)');
    expect(result.attachments).toHaveLength(3);

    await expect(result.markdown).toMatchFileSnapshot(
      './__snapshots__/report-markdown.output.md',
    );
  });

  it('uses timing fallback fields and custom screenshot directory', () => {
    const screenshot = ScreenshotItem.create(
      'data:image/png;base64,Zm9v',
      1710000000000,
    );

    const execution: IExecutionDump = {
      logTime: 1710000000000,
      name: 'fallback execution',
      tasks: [
        createTask({
          taskId: 'task-fallback',
          timing: {
            callAiStart: 1710000000001,
            callAiEnd: 1710000000009,
          },
          uiContext: {
            screenshot,
            shotSize: { width: 800, height: 600 },
          },
        }),
      ],
    };

    const result = executionToMarkdown(execution, {
      screenshotBaseDir: './shots',
    });

    expect(result.markdown).toContain('./shots/');
    expect(result.markdown).toContain('Cost(ms): 8');
    expect(result.markdown).toContain('Screen size: 800 x 600');
    expect(result.attachments).toHaveLength(1);
  });

  it('throws with invalid input', () => {
    expect(() => executionToMarkdown({} as any)).toThrow(
      'executionToMarkdown: execution.tasks must be an array',
    );

    expect(() =>
      reportToMarkdown({
        groupName: 'bad',
      } as any),
    ).toThrow('reportToMarkdown: report.executions must be an array');
  });

  it('gracefully skips tasks without screenshots', () => {
    const execution: IExecutionDump = {
      logTime: 1710000000000,
      name: 'no-screenshot-execution',
      tasks: [createTask()],
    };

    const result = executionToMarkdown(execution);
    expect(result.markdown).toContain('# no-screenshot-execution');
    expect(result.markdown).toContain('Tap - Submit');
    expect(result.markdown).toContain('Screen size: N/A');
    expect(result.attachments).toHaveLength(0);
  });
});
