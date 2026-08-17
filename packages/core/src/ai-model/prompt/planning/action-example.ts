import { findAllMidsceneLocatorField } from '@/common';
import { actionInputParamSchema, actionTapParamSchema } from '@/device';
import type { DeviceAction } from '@/types';
import type { z } from 'zod';
import {
  type LocateResultPromptSpec,
  formatLocateExampleValue,
} from '../../shared/model-locate-result';

export type ActionExampleDefinition = Pick<
  DeviceAction<any>,
  'name' | 'paramSchema' | 'sample'
>;

type PlanningActionOutput = {
  type: string;
  param: Record<string, unknown>;
};

const serializeActionParam = (
  param: Record<string, unknown>,
  locateFields: string[],
  locatePromptSpec: LocateResultPromptSpec,
) => {
  const locatorObjects = new WeakSet<object>();
  for (const field of locateFields) {
    const value = param[field];
    if (value && typeof value === 'object') {
      locatorObjects.add(value);
    }
  }

  const originalJson = JSON.stringify(param);
  // Ensure generated markers cannot collide with strings already present in the sample.
  let markerPrefix = '__MIDSCENE_LOCATE_RESULT_EXAMPLE_';
  while (originalJson.includes(markerPrefix)) {
    markerPrefix = `_${markerPrefix}`;
  }

  const replacements = new Map<string, string>();
  const serializedParam = JSON.stringify(
    param,
    function (this: object, key, value) {
      if (locatorObjects.has(this) && key === locatePromptSpec.resultKey) {
        const marker = `${markerPrefix}${replacements.size}__`;
        replacements.set(marker, formatLocateExampleValue(value));
        return marker;
      }
      return value;
    },
    2,
  );

  return [...replacements].reduce(
    (result, [marker, locateResultValue]) =>
      result.replace(JSON.stringify(marker), locateResultValue),
    serializedParam,
  );
};

export const buildPlanningActionOutput = (
  { type, param }: PlanningActionOutput,
  {
    locateFields,
    locatePromptSpec,
  }: {
    locateFields?: string[];
    locatePromptSpec?: LocateResultPromptSpec;
  } = {},
) => `<action-type>${type}</action-type>
<action-param-json>
${
  // Keep locate result arrays on one line when serializing action examples.
  locateFields && locatePromptSpec
    ? serializeActionParam(param, locateFields, locatePromptSpec)
    : JSON.stringify(param, null, 2)
}
</action-param-json>`;

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
  }: {
    locatePromptSpec?: LocateResultPromptSpec;
    /**
     * Selects the locate result example value injected into this action.
     * Keep the same index for the same example across multi-turn prompt
     * variants, and use different indexes for different examples to avoid
     * reusing identical locate coordinates.
     */
    locateResultExampleIndex?: number;
  } = {},
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

  return buildPlanningActionOutput(
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
