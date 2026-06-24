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
              description: 'Post-click state',
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
    expect(result.markdown).toContain('description=Post-click state');
    expect(result.markdown).toContain('Screen size: 1280 x 720');
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0].suggestedFileName).toContain('.png');
    expect(result.markdown).toContain(
      `./screenshots/${result.attachments[0].suggestedFileName}`,
    );
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
    expect(result.markdown).not.toContain('Suggested execution markdown files');
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

  it('preserves restored screenshot source refs for file-backed export', () => {
    const execution: IExecutionDump = {
      logTime: 1710000000000,
      name: 'restored file screenshot',
      tasks: [
        createTask({
          uiContext: {
            screenshot: {
              base64: './screenshots/original-shot.png',
              capturedAt: 1710000000000,
              sourceRef: {
                type: 'midscene_screenshot_ref',
                id: 'original-shot',
                capturedAt: 1710000000000,
                mimeType: 'image/png',
                storage: 'file',
                path: './screenshots/original-shot.png',
              },
            },
          },
        }),
      ],
    };

    const result = executionToMarkdown(execution);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toMatchObject({
      id: 'original-shot',
      suggestedFileName: 'execution-1-task-1-original-shot.png',
      base64Data: './screenshots/original-shot.png',
      sourceRef: {
        path: './screenshots/original-shot.png',
      },
    });
    expect(result.markdown).toContain(
      './screenshots/execution-1-task-1-original-shot.png',
    );
  });

  it('includes model metadata, token usage, and task context for agent analysis', () => {
    const report: IReportActionDump = {
      sdkVersion: '1.0.0',
      groupName: 'agent-ready-report',
      modelBriefs: [
        {
          intent: 'planning',
          name: 'gpt-4o',
          modelDescription: 'vision planner',
        },
      ],
      deviceType: 'web',
      executions: [
        {
          logTime: 1710000000000,
          name: 'agent execution',
          aiActContext: 'Complete checkout.',
          tasks: [
            createTask({
              taskId: 'task-agent-context',
              usage: {
                intent: 'planning',
                model_name: 'gpt-4o',
                model_description: 'vision planner',
                prompt_tokens: 100,
                cached_input: 20,
                completion_tokens: 30,
                total_tokens: 130,
                time_cost: 456,
                request_id: 'req-main',
              },
              searchAreaUsage: {
                intent: 'insight',
                model_name: 'gpt-4o-mini',
                prompt_tokens: 10,
                completion_tokens: 3,
                total_tokens: 13,
                time_cost: 123,
                request_id: 'req-search',
              },
              output: {
                result: 'clicked',
              },
              log: {
                note: 'button matched',
              },
              thought: 'Submit button is visible.',
              reasoning_content: 'Clicking submit completes the form.',
            }),
          ],
        },
      ],
    };

    const result = reportToMarkdown(report);

    expect(result.markdown).toContain('## Model Info');
    expect(result.markdown).toContain('| planning | gpt-4o | vision planner |');
    expect(result.markdown).toContain('## Token Usage Summary');
    expect(result.markdown).toContain(
      '| gpt-4o | 1 | 100 | 20 | 30 | 130 | 456 |',
    );
    expect(result.markdown).toContain(
      '| gpt-4o-mini | 1 | 10 | 0 | 3 | 13 | 123 |',
    );
    expect(result.markdown).toContain('### Model Usage');
    expect(result.markdown).toContain('req-main');
    expect(result.markdown).toContain('req-search');
    expect(result.markdown).toContain('### AI Action Context');
    expect(result.markdown).toContain('Complete checkout.');
    expect(result.markdown).toContain('### Param');
    expect(result.markdown).toContain('"prompt": "Submit"');
    expect(result.markdown).toContain('### Output');
    expect(result.markdown).toContain('"result": "clicked"');
    expect(result.markdown).toContain('### Log');
    expect(result.markdown).toContain('"note": "button matched"');
    expect(result.markdown).toContain('### Thought');
    expect(result.markdown).toContain('Submit button is visible.');
    expect(result.markdown).toContain('### Reasoning Content');
    expect(result.markdown).toContain('Clicking submit completes the form.');
  });

  it('falls back report model info to task usage when model briefs are missing', () => {
    const report: IReportActionDump = {
      sdkVersion: '1.0.0',
      groupName: 'usage-model-report',
      modelBriefs: [],
      executions: [
        {
          logTime: 1710000000000,
          name: 'usage execution',
          tasks: [
            createTask({
              usage: {
                intent: 'planning',
                model_name: 'openai_qwen3.5-plus',
                model_description: 'qwen3.5 mode',
                prompt_tokens: 100,
                completion_tokens: 20,
              },
            }),
          ],
        },
      ],
    };

    const result = reportToMarkdown(report);

    expect(result.markdown).toContain('## Model Info');
    expect(result.markdown).toContain(
      '| planning | openai_qwen3.5-plus | qwen3.5 mode |',
    );
    expect(result.markdown).not.toContain(
      'No report-level model metadata recorded',
    );
  });

  it('handles recorder screenshots stored as base64 strings', () => {
    const execution: IExecutionDump = {
      logTime: 1710000000000,
      name: 'recorder string screenshot',
      tasks: [
        createTask({
          taskId: 'task-recorder-string',
          uiContext: {
            screenshot: {
              base64: 'data:image/png;base64,bWFpbg==',
              capturedAt: 1710000000000,
            },
            shotSize: { width: 800, height: 600 },
          },
          recorder: [
            {
              type: 'screenshot',
              ts: 1710000000050,
              timing: 'after action',
              screenshot: 'data:image/png;base64,cmVjb3JkZXI=',
            },
          ],
        }),
      ],
    };

    const result = executionToMarkdown(execution);

    expect(result.markdown).toContain('### Recorder');
    expect(result.markdown).toContain('timing=after action');
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0].base64Data).toBe(
      'data:image/png;base64,bWFpbg==',
    );
    expect(result.attachments[1].base64Data).toBe(
      'data:image/png;base64,cmVjb3JkZXI=',
    );
    expect(result.attachments[1].suggestedFileName).toContain('recorder-1');
    expect(result.attachments[1].suggestedFileName).not.toBe(
      result.attachments[0].suggestedFileName,
    );
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
