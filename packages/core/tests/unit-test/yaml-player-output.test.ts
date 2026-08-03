import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScriptPlayer } from '@/yaml/player';
import { describe, expect, test, vi } from 'vitest';

describe('YAML player output', () => {
  test('flushes assertion result before marking the task as failed', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'midscene-yaml-output-'));
    const outputPath = join(outputDir, 'result.json');
    const assertionResult = {
      pass: false,
      thought: 'The page does not match the assertion.',
      message: 'Expected assertion failure',
    };
    const agent = {
      aiAssert: vi.fn().mockResolvedValue(assertionResult),
      getActionSpace: vi.fn().mockResolvedValue([]),
      onTaskStartTip: undefined,
      reportFile: null,
    };
    const player = new ScriptPlayer(
      {
        target: {
          output: outputPath,
        },
        tasks: [
          {
            name: 'check content',
            flow: [
              {
                aiAssert: 'this is a food delivery service app',
              },
            ],
          },
        ],
      } as any,
      async () => ({
        agent: agent as any,
        freeFn: [],
      }),
    );

    try {
      await player.run();

      expect(player.status).toBe('error');
      expect(player.taskStatusList[0].status).toBe('error');
      expect(player.taskStatusList[0].error?.message).toBe(
        assertionResult.message,
      );
      expect(JSON.parse(readFileSync(outputPath, 'utf-8'))).toEqual({
        0: assertionResult,
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
