import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ScriptPlayer } from '@/yaml/player';
import { parseYamlScript } from '@/yaml/utils';
import { describe, expect, rs, test } from '@rstest/core';

describe('YAML player output', () => {
  test.each([
    ['legacy target', 'target', 'abc.json'],
    ['web', 'web', 'def.json'],
  ])(
    'resolves configured output paths for the %s environment without launching an agent',
    (_label, environmentKey, fileName) => {
      const setupAgent = rs.fn();
      const relativeOutput = `./midscene_run/output/${fileName}`;
      const script = parseYamlScript(`
${environmentKey}:
  url: https://example.test
  output: ${relativeOutput}
tasks: []
`);

      const player = new ScriptPlayer(script, setupAgent);

      expect(player.output).toBe(resolve(process.cwd(), relativeOutput));
      expect(setupAgent).not.toHaveBeenCalled();
    },
  );

  test('flushes assertion result before marking the task as failed', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'midscene-yaml-output-'));
    const outputPath = join(outputDir, 'result.json');
    const assertionResult = {
      pass: false,
      thought: 'The page does not match the assertion.',
      message: 'Expected assertion failure',
    };
    const agent = {
      aiAssert: rs.fn().mockResolvedValue(assertionResult),
      getActionSpace: rs.fn().mockResolvedValue([]),
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
