import { describe, expect, it } from 'vitest';
import { ScreenshotItem } from '../../src/screenshot-item';
import {
  ExecutionDump,
  type IExecutionDump,
  type IReportActionDump,
  ReportActionDump,
} from '../../src/types';

/**
 * The `frameSequence` feature attaches a `screenshotSequence` (a transient
 * multi-frame model input) to `task.uiContext`. Those frames are NOT persisted
 * by collectScreenshots, so dump serialization must drop the field to avoid
 * dangling screenshot refs and base64 bloat. The representative `screenshot`
 * must still be serialized.
 */
describe('dump serialization drops screenshotSequence', () => {
  const FRAME_A = 'data:image/png;base64,iVBORw0KGgoAAAA-FRAME-A';
  const FRAME_B = 'data:image/png;base64,iVBORw0KGgoAAAA-FRAME-B';
  const FRAME_C = 'data:image/png;base64,iVBORw0KGgoAAAA-FRAME-C';

  const buildExecutionDumpData = (): IExecutionDump => {
    const representative = ScreenshotItem.create(FRAME_C, 3);
    return {
      logTime: 1,
      name: 'frame-sequence-dump',
      tasks: [
        {
          type: 'Insight',
          subType: 'Assert',
          status: 'finished',
          param: {},
          timing: { start: 1, end: 2, cost: 1 },
          executor: async () => {},
          uiContext: {
            screenshot: representative,
            screenshotSequence: [
              ScreenshotItem.create(FRAME_A, 1),
              ScreenshotItem.create(FRAME_B, 2),
              representative,
            ],
            shotSize: { width: 100, height: 100 },
            shrunkShotToLogicalRatio: 1,
          },
        } as any,
      ],
    };
  };

  it('omits screenshotSequence from ExecutionDump.serialize() (ref mode)', () => {
    const serialized = new ExecutionDump(buildExecutionDumpData()).serialize();

    expect(serialized).not.toContain('screenshotSequence');
    // The early frames must not leak their base64 either.
    expect(serialized).not.toContain('FRAME-A');
    expect(serialized).not.toContain('FRAME-B');
    // The representative screenshot is still serialized (as a ref).
    expect(serialized).toContain('screenshot');
  });

  it('omits screenshotSequence from serializeWithInlineScreenshots() (inline mode)', () => {
    const reportData: IReportActionDump = {
      sdkVersion: '1.0.0',
      groupName: 'frame-sequence',
      modelBriefs: [],
      executions: [buildExecutionDumpData()],
    };
    const serialized = new ReportActionDump(
      reportData,
    ).serializeWithInlineScreenshots();

    expect(serialized).not.toContain('screenshotSequence');
    // Inline mode would embed each frame's base64; the sequence frames must be
    // dropped so only the representative frame is inlined.
    expect(serialized).not.toContain('FRAME-A');
    expect(serialized).not.toContain('FRAME-B');
    expect(serialized).toContain('FRAME-C');
  });
});
