import { findAllMidsceneLocatorField } from '@/common';
import type { DeviceAction } from '@/types';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';

const injectLocateResultIntoSample = (
  sample: Record<string, any>,
  locateFields: string[],
  promptSpec: LocateResultPromptSpec,
): Record<string, any> => {
  const result = { ...sample };
  let sampleResultIndex = 0;

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
            sampleResultIndex % promptSpec.exampleValues.length
          ],
      };
      sampleResultIndex++;
    }
  }

  return result;
};

export const buildActionExample = (
  action: DeviceAction<any>,
  locatePromptSpec?: LocateResultPromptSpec,
) => {
  if (!action.sample || typeof action.sample !== 'object') {
    return undefined;
  }

  const sampleWithLocateResult =
    locatePromptSpec
      ? injectLocateResultIntoSample(
          action.sample,
          findAllMidsceneLocatorField(action.paramSchema),
          locatePromptSpec,
        )
      : action.sample;

  return `<action-type>${action.name}</action-type>
<action-param-json>
${JSON.stringify(sampleWithLocateResult, null, 2)}
</action-param-json>`;
};
