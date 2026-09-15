import { executionRecordsToReportInput } from '@/test-runner';
import { ScriptPlayer } from '@/yaml/player';
import { expect, test } from '@rstest/core';

test('keeps legacy named output on the player, not in the common document namespace', async () => {
  const player = new ScriptPlayer(
    {
      tasks: [
        {
          name: 'results',
          flow: [
            { javascript: 'unnamed' },
            { javascript: 'named', name: 'answer' },
          ],
        },
      ],
    },
    async () => ({
      agent: {
        getActionSpace: async () => [],
        evaluateJavaScript: async (code: string) =>
          code === 'unnamed' ? 42 : 7,
      } as any,
      freeFn: [],
    }),
  );
  player.output = undefined;
  await player.run();
  const record = player.executionRecord!;
  const input = executionRecordsToReportInput([record], { runId: 'root' });

  expect(player.result).toEqual({ 0: 42, answer: 7 });
  expect(input.projects[0].documents[0]).not.toHaveProperty('outputs');
  expect(record.outputs).toEqual(player.result);
  expect(record.execution?.document).not.toHaveProperty('outputs');
  expect(
    record.execution?.cases[0].run?.steps.map((step) => step.output?.data),
  ).toEqual([42, 7]);
});
