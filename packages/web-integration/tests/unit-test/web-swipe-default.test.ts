import { describe, expect, it, rs } from '@rstest/core';
import type { AbstractWebPage } from '../../src/web-page';
import {
  commonWebActionsForWebPage,
  createWebInputPrimitives,
} from '../../src/web-page';

describe('web touch-style Swipe defaults', () => {
  it.each([undefined, 300, 800])(
    'preserves explicit duration %s across action and primitive calls',
    async (duration) => {
      const swipe = rs.fn().mockResolvedValue(undefined);
      const page = {
        swipe,
        size: async () => ({ width: 400, height: 800 }),
      } as unknown as AbstractWebPage;
      const start = { x: 200, y: 400 };
      const end = { x: 200, y: 100 };
      await createWebInputPrimitives(page).touch.swipe(
        start,
        end,
        duration === undefined ? undefined : { duration },
      );
      expect(swipe).toHaveBeenLastCalledWith(start, end, duration ?? 500);
      const action = commonWebActionsForWebPage(page, true).find(
        (entry) => entry.name === 'Swipe',
      )!;
      const param = {
        direction: 'up',
        distance: 300,
        ...(duration === undefined ? {} : { duration }),
      };
      const parsed = action.paramSchema!.parse(param);
      expect(parsed.duration).toBe(duration ?? 500);
      for (const input of [param, parsed]) {
        await action.call(input);
        expect(swipe).toHaveBeenLastCalledWith(start, end, duration ?? 500);
      }
    },
  );
});
