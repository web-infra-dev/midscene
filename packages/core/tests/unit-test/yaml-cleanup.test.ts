import type { Agent } from '@/agent/agent';
import { runFreeFnCleanup } from '@/yaml/cleanup';
import { ScriptPlayer } from '@/yaml/player';
import { describe, expect, rstest as rs, test } from '@rstest/core';

describe('YAML resource cleanup', () => {
  test('runs cleanup functions in declared order and attempts all of them', async () => {
    const order: string[] = [];
    const firstError = new Error('first cleanup failed');
    const lastError = new Error('last cleanup failed');

    await expect(
      runFreeFnCleanup([
        {
          name: 'agent',
          fn: async () => {
            order.push('agent');
            throw firstError;
          },
        },
        {
          name: 'page',
          fn: () => {
            order.push('page');
          },
        },
        {
          name: 'browser',
          fn: () => {
            order.push('browser');
            throw lastError;
          },
        },
      ]),
    ).rejects.toMatchObject({
      errors: [firstError, lastError],
    });
    expect(order).toEqual(['agent', 'page', 'browser']);
  });

  test('ScriptPlayer rejects when resource cleanup fails', async () => {
    const cleanupError = new Error('cleanup failed');
    const agent = {
      getActionSpace: rs.fn().mockResolvedValue([]),
    } as unknown as Agent;
    const player = new ScriptPlayer({ tasks: [] }, async () => ({
      agent,
      freeFn: [
        { name: 'failing cleanup', fn: () => Promise.reject(cleanupError) },
      ],
    }));

    await expect(player.run()).rejects.toBe(cleanupError);
  });
});
