import { executionRecordsToReportInput } from '@/test-runner';
import { ScriptPlayer } from '@/yaml/player';
import { expect, test } from '@rstest/core';

test('keeps named and unnamed legacy results in the common execution result', async () => {
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

  expect(input.projects[0].documents[0].outputs).toEqual({
    0: 42,
    answer: 7,
  });
  expect(record.outputs).toEqual(player.result);
  expect(record.execution?.document.outputs).toEqual({
    0: 42,
    answer: 7,
  });
});
