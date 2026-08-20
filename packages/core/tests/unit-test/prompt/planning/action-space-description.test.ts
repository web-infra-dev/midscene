import type { StandardPlanningProtocol } from '@/ai-model/model-adapter/planning-protocol';
import { buildPlanningActionSpaceDescription } from '@/ai-model/prompt/planning';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import { getMidsceneLocationSchema } from '@/index';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

describe('buildPlanningActionSpaceDescription', () => {
  it('builds examples and serializes protocol-specific action descriptions', () => {
    const locatePromptSpec: LocateResultPromptSpec = {
      resultKey: 'point',
      resultValueSchema: '[number, number]',
      resultValueDescription: 'point coordinates',
      resultNoun: 'point',
      resultNounPlural: 'points',
      exampleValues: [[500, 500]],
    };
    const buildLocateFieldDescription = vi.fn(() => 'LOCATE_FIELD');
    const buildActionOutput = vi.fn(
      ({ actionName }: { actionName: string }) => `<tool>${actionName}</tool>`,
    );
    const planningProtocol: StandardPlanningProtocol = {
      actionSpaceProtocol: {
        title: 'Functions',
        format: 'jsonl',
        buildLocateFieldDescription,
        buildActionDescription: ({
          action,
          locateFieldDescription,
          actionOutputExample,
        }) => ({
          name: action.name,
          locateFieldDescription,
          actionOutputExample,
        }),
      },
      actionOutputProtocol: {
        actionOutputTagNames: ['tool'],
        actionOutputRules: 'Return a tool.',
        actionOutputPlaceholder: '<tool>...</tool>',
        buildActionOutput,
        parseActionOutput: () => null,
      },
    };

    const result = buildPlanningActionSpaceDescription({
      actionSpace: [
        {
          name: 'Tap',
          description: 'Tap an element',
          paramSchema: z.object({
            locate: getMidsceneLocationSchema(),
          }),
          sample: { locate: { prompt: 'the Submit button' } },
          call: async () => {},
        },
      ],
      locatePromptSpec,
      planningProtocol,
    });

    expect(result).toBe(
      '{"name":"Tap","locateFieldDescription":"LOCATE_FIELD","actionOutputExample":"<tool>Tap</tool>"}',
    );
    expect(buildLocateFieldDescription).toHaveBeenCalledWith(locatePromptSpec);
    expect(buildActionOutput).toHaveBeenCalledWith({
      actionName: 'Tap',
      param: {
        locate: {
          prompt: 'the Submit button',
          point: [500, 500],
        },
      },
      locateFields: ['locate'],
      locateResultKey: 'point',
    });
  });
});
