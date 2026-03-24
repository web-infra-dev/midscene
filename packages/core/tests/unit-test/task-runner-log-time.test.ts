import { ScreenshotItem } from '@/screenshot-item';
import { TaskRunner } from '@/task-runner';
import type { UIContext } from '@/types';
import { describe, expect, it } from 'vitest';

const fakeUIContextBuilder = async () => {
  const screenshot = ScreenshotItem.create('', Date.now());
  return {
    screenshot,
    tree: { node: null, children: [] },
    shotSize: { width: 0, height: 0 },
    shrunkShotToLogicalRatio: 1,
  } as unknown as UIContext;
};

describe('TaskRunner dump logTime stability', () => {
  it('should keep the same logTime across repeated dumps of the same runner', async () => {
    const runner = new TaskRunner('stable-log-time', fakeUIContextBuilder);

    const firstDump = runner.dump();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondDump = runner.dump();

    expect(secondDump.logTime).toBe(firstDump.logTime);
  });
});
