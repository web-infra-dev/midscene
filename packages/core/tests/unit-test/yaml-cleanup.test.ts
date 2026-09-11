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
    expect(player.status).toBe('error');
    expect(player.executionResult?.document.status).toBe('success');
    expect(player.executionRecord).toMatchObject({
      status: 'failed',
      cleanupErrors: [cleanupError],
    });
  });

  test('records setup failure even when the kernel cannot start', async () => {
    const failure = new Error('setup failed');
    const player = new ScriptPlayer({ tasks: [] }, async () => {
      throw failure;
    });
    await player.run();
    expect(player.errorInSetup).toBe(failure);
    expect(player.executionRecord).toMatchObject({
      status: 'failed',
      setupError: failure,
    });
    expect(player.executionRecord?.execution).toBeUndefined();
  });

  test('cleans up an acquired Agent if discovering its actions fails', async () => {
    const failure = new Error('actions unavailable');
    const cleanup = rs.fn();
    const player = new ScriptPlayer({ tasks: [] }, async () => ({
      agent: {
        getActionSpace: async () => {
          throw failure;
        },
      } as any,
      freeFn: [{ name: 'agent', fn: cleanup }],
    }));
    await player.run();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(player.executionRecord).toMatchObject({
      status: 'failed',
      setupError: failure,
    });
  });

  test('retains both setup and cleanup errors', async () => {
    const setupError = new Error('actions unavailable');
    const cleanupError = new Error('cleanup failed');
    const player = new ScriptPlayer({ tasks: [] }, async () => ({
      agent: {
        getActionSpace: async () => {
          throw setupError;
        },
      } as any,
      freeFn: [
        {
          name: 'agent',
          fn: async () => {
            throw cleanupError;
          },
        },
      ],
    }));
    await expect(player.run()).rejects.toBe(cleanupError);
    expect(player.executionRecord).toMatchObject({
      status: 'failed',
      setupError,
      cleanupErrors: [cleanupError],
    });
  });
});
