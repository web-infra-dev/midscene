import { Agent } from '@/agent';
import { ActionRecord } from '@/agent/action-record';
import { ScreenshotItem } from '@/screenshot-item';
import type { ActionRecordDump } from '@/types';
import { describe, expect, it, vi } from 'vitest';

const makeRecordDump = (framesCount = 2): ActionRecordDump => {
  const frames = Array.from({ length: framesCount }, (_, index) => {
    const timestamp = 1000 + index * 100;
    const screenshot = ScreenshotItem.create(
      `data:image/png;base64,frame-${index + 1}`,
      timestamp,
    );
    return {
      id: screenshot.id,
      timestamp,
      offset: index * 100,
      screenshot,
    };
  });

  return {
    id: 'record-id',
    actionTaskId: 'action-task-id',
    actionName: 'Tap',
    actionTitle: 'Tap',
    startedAt: 1000,
    endedAt: 1200,
    interval: 100,
    maxCount: framesCount,
    shotSize: { width: 100, height: 80 },
    shrunkShotToLogicalRatio: 1,
    frames,
  };
};

const createAgentStub = (record: ActionRecordDump) => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).callActionInActionSpace = vi.fn(async () => ({ record }));
  return agent;
};

describe('ActionRecord', () => {
  it('passes recorded frames to record insight APIs', async () => {
    const runner = vi.fn(async () => ({ output: true, thought: 'ok' }));
    const record = new ActionRecord(makeRecordDump(2), runner);

    await record.aiAssert('出现保存成功 toast');

    expect(runner).toHaveBeenCalledTimes(1);
    const [, type, demand, , multimodalPrompt, reportDemand] =
      runner.mock.calls[0];
    expect(type).toBe('Assert');
    expect(demand).toContain('recorded action frames');
    expect(reportDemand).toBe('出现保存成功 toast');
    expect(multimodalPrompt?.images).toHaveLength(1);
    expect(multimodalPrompt?.images?.[0].name).toContain('record-frame-2');
  });

  it('throws record insight APIs clearly when no frame was captured', async () => {
    const runner = vi.fn(async () => ({ output: true }));
    const record = new ActionRecord(makeRecordDump(0), runner);

    await expect(record.aiAssert('出现保存成功 toast')).rejects.toThrow(
      /has no frames/,
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it('forwards record options without leaking them into action params', async () => {
    const recordDump = makeRecordDump(1);
    const agent = createAgentStub(recordDump);
    const callActionSpy = (agent as any).callActionInActionSpace as ReturnType<
      typeof vi.fn
    >;

    const result = await agent.aiTap('保存按钮', {
      deepLocate: true,
      record: {
        interval: 100,
        maxCount: 2,
      },
    });

    expect(callActionSpy).toHaveBeenCalledWith(
      'Tap',
      {
        locate: expect.objectContaining({
          prompt: '保存按钮',
          deepLocate: true,
        }),
      },
      {
        record: {
          interval: 100,
          maxCount: 2,
        },
      },
    );
    expect((callActionSpy.mock.calls[0][1] as any).record).toBeUndefined();
    expect(result.record.frames).toHaveLength(1);
    expect(result.aiAssert).toBeTypeOf('function');
  });
});
