import { findAllMidsceneLocatorField } from '@/common';
import { actionInputParamSchema, actionTapParamSchema } from '@/device';
import type { DeviceAction } from '@/types';
import type { z } from 'zod';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import type { PlanningActionOutputProtocol } from './action-output-protocol';

export type ActionExampleDefinition = Pick<
  DeviceAction<any>,
  'name' | 'paramSchema' | 'sample'
>;

const injectLocateResultIntoSample = (
  sample: Record<string, any>,
  locateFields: string[],
  promptSpec: LocateResultPromptSpec,
  locateResultExampleIndex: number,
): Record<string, any> => {
  const result = { ...sample };
  let exampleIndex = locateResultExampleIndex;

  for (const field of locateFields) {
    if (
      result[field] &&
      typeof result[field] === 'object' &&
      result[field].prompt
    ) {
      result[field] = {
        ...result[field],
        [promptSpec.resultKey]:
          promptSpec.exampleValues[
            exampleIndex % promptSpec.exampleValues.length
          ],
      };
      exampleIndex++;
    }
  }

  return result;
};

export const buildActionExample = (
  action: ActionExampleDefinition,
  {
    locatePromptSpec,
    locateResultExampleIndex = 0,
    actionOutputProtocol,
  }: {
    locatePromptSpec?: LocateResultPromptSpec;
    /**
     * Selects the locate result example value injected into this action.
     * Keep the same index for the same example across multi-turn prompt
     * variants, and use different indexes for different examples to avoid
     * reusing identical locate coordinates.
     */
    locateResultExampleIndex?: number;
    actionOutputProtocol: PlanningActionOutputProtocol;
  },
) => {
  if (!action.sample || typeof action.sample !== 'object') {
    return undefined;
  }

  const locateFields = findAllMidsceneLocatorField(action.paramSchema);
  const sampleWithLocateResult = locatePromptSpec
    ? injectLocateResultIntoSample(
        action.sample,
        locateFields,
        locatePromptSpec,
        locateResultExampleIndex,
      )
    : action.sample;

  return actionOutputProtocol.buildActionOutput(
    {
      type: action.name,
      param: sampleWithLocateResult,
    },
    {
      locateFields,
      locatePromptSpec,
    },
  );
};

export const createSampleTapAction = (
  prompt: string,
): ActionExampleDefinition => {
  const sample: z.input<typeof actionTapParamSchema> = {
    locate: { prompt },
  };
  return {
    name: 'Tap',
    paramSchema: actionTapParamSchema,
    sample,
  };
};

export const createSampleInputAction = (
  value: string,
): ActionExampleDefinition => {
  const sample: z.input<typeof actionInputParamSchema> = { value };
  return {
    name: 'Input',
    paramSchema: actionInputParamSchema,
    sample,
  };
};
