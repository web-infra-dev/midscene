import { findAllMidsceneLocatorField } from '@/common';
import { actionInputParamSchema, actionTapParamSchema } from '@/device';
import type { DeviceAction } from '@/types';
import type { z } from 'zod';
import type { PlanningActionOutputProtocol } from '../../model-adapter/planning-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';

export type ActionOutputExampleDefinition = Pick<
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

export const buildActionOutputExample = (
  action: ActionOutputExampleDefinition,
  {
    locatePromptSpec,
    locateResultExampleIndex = 0,
    buildActionOutput,
  }: {
    locatePromptSpec?: LocateResultPromptSpec;
    /**
     * Selects the locate result example value injected into this action.
     * Keep the same index for the same example across multi-turn prompt
     * variants, and use different indexes for different examples to avoid
     * reusing identical locate coordinates.
     */
    locateResultExampleIndex?: number;
    buildActionOutput: PlanningActionOutputProtocol['buildActionOutput'];
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

  return buildActionOutput({
    actionName: action.name,
    param: sampleWithLocateResult,
    locateFields,
    locateResultKey: locatePromptSpec?.resultKey,
  });
};

export const createSampleTapAction = (
  prompt: string,
): ActionOutputExampleDefinition => {
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
): ActionOutputExampleDefinition => {
  const sample: z.input<typeof actionInputParamSchema> = { value };
  return {
    name: 'Input',
    paramSchema: actionInputParamSchema,
    sample,
  };
};
