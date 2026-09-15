import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ScriptPlayer } from '@/yaml/player';
import { parseYamlScript, resolveYamlOutputConfig } from '@/yaml/utils';
import { describe, expect, rs, test } from '@rstest/core';

describe('YAML player output', () => {
  test.each([
    ['legacy target', 'target', 'abc.json'],
    ['web', 'web', 'def.json'],
    ['page', 'page', 'page.json'],
    ['browser', 'browser', 'browser.json'],
    ['harmony', 'harmony', 'harmony.json'],
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

  test('uses shared config defaults and preserves target-local output precedence', () => {
    expect(
      resolveYamlOutputConfig({
        page: {
          url: 'about:blank',
          output: 'local.json',
          unstableLogContent: false,
        },
        config: {
          output: 'default.json',
          unstableLogContent: 'default-log.json',
        },
      }),
    ).toEqual({ output: 'local.json', unstableLogContent: false });
    const player = new ScriptPlayer(
      {
        browser: { url: 'about:blank' },
        config: {
          output: 'default.json',
          unstableLogContent: 'default-log.json',
        },
        tasks: [],
      },
      rs.fn(),
    );
    expect(player.output).toBe(resolve('default.json'));
    expect(player.unstableLogContent).toBe(resolve('default-log.json'));
  });

  test.each(['output', 'unstableLogContent'] as const)(
    'treats %s publication failure as terminal infrastructure failure after completed actions',
    async (field) => {
      const directory = mkdtempSync(join(tmpdir(), 'yaml-publication-'));
      const blocker = join(directory, 'not-a-directory');
      writeFileSync(blocker, 'blocked');
      const evaluateJavaScript = rs.fn().mockResolvedValue(42);
      const agent = {
        evaluateJavaScript,
        getActionSpace: async () => [],
        _unstableLogContent: () => ({ logs: [] }),
        reportFile: null,
      };
      const player = new ScriptPlayer(
        {
          page: {
            url: 'about:blank',
            output: join(directory, 'output.json'),
            [field]: join(blocker, 'result.json'),
          },
          tasks: [
            {
              name: 'publish',
              flow: [
                { javascript: 'first()', name: 'value' },
                ...(field === 'output'
                  ? [{ javascript: 'must-not-run()' }]
                  : []),
              ],
            },
            { name: 'later', flow: [{ javascript: 'must-not-run()' }] },
          ],
        },
        async () => ({ agent: agent as any, freeFn: [] }),
      );
      try {
        await expect(player.run()).rejects.toThrow('write-result');
        expect(evaluateJavaScript).toHaveBeenCalledTimes(1);
        expect(player.result).toEqual({ value: 42 });
        expect(player.executionRecord).toMatchObject({
          status: 'failed',
          outputs: { value: 42 },
          publicationErrors: [{ code: 'WORKFLOW_PUBLICATION_FAILED' }],
          execution: {
            cases: [
              { run: { steps: [{ status: 'success', output: { data: 42 } }] } },
              { status: 'not-run' },
            ],
          },
        });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
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
