import { ExecutionDump, ReportActionDump } from '@/dump/report-action-dump';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask, UIContext, UITreeSnapshot } from '@/types';
import { describe, expect, it } from 'vitest';

describe('UI tree report serialization', () => {
  it('keeps the captured tree directly on ExecutionTask.uiContext', () => {
    const uiTree: UITreeSnapshot = {
      platform: 'android',
      capturedAt: 123,
      root: {
        type: 'android.widget.FrameLayout',
        attrs: { package: 'com.example' },
        bounds: { left: 0, top: 0, width: 100, height: 200 },
        children: [
          {
            type: 'android.widget.Button',
            attrs: { 'resource-id': 'submit', text: 'Submit' },
            bounds: { left: 10, top: 20, width: 80, height: 40 },
            children: [],
          },
        ],
      },
      xpathPolicy: {
        stableAttrs: ['resource-id'],
        textAttrs: ['content-desc', 'text'],
        excludedTargetTypes: ['android.webkit.WebView'],
        max: 3,
      },
    };
    const uiContext = {
      screenshot: ScreenshotItem.create('data:image/png;base64,AAA', 122),
      shotSize: { width: 100, height: 200 },
      shrunkShotToLogicalRatio: 1,
      uiTree,
    } as UIContext;
    const task = {
      type: 'Log',
      taskId: 'tree-task',
      status: 'finished',
      uiContext,
      executor: async () => undefined,
    } as unknown as ExecutionTask;
    const dump = new ReportActionDump({
      sdkVersion: 'test',
      groupName: 'Android tree',
      modelBriefs: [],
      executions: [
        new ExecutionDump({
          logTime: 1,
          name: 'capture tree',
          tasks: [task],
        }),
      ],
      deviceType: 'android',
    });

    const restored = ReportActionDump.fromSerializedString(dump.serialize());

    expect(restored.executions[0].tasks[0].uiContext?.uiTree).toEqual(uiTree);
  });
});
