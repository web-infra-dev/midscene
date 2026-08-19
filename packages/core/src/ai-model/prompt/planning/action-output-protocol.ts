import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import { formatLocateExampleValue } from '../../shared/model-locate-result';

export type PlanningActionOutput = {
  type: string;
  param: Record<string, unknown>;
};

type BuildPlanningActionOutputOptions = {
  locateFields?: string[];
  locatePromptSpec?: LocateResultPromptSpec;
};

export type PlanningActionOutputProtocol = {
  actionOutputTagNames: readonly [string, ...string[]];
  actionOutputRules: string;
  actionOutputPlaceholder: string;
  buildActionOutput: (
    action: PlanningActionOutput,
    options?: BuildPlanningActionOutputOptions,
  ) => string;
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
  { locateFields, locatePromptSpec }: BuildPlanningActionOutputOptions = {},
) => `<action-type>${type}</action-type>
<action-param-json>
${
  // Keep locate result arrays on one line when serializing action examples.
  locateFields && locatePromptSpec
    ? serializeActionParam(param, locateFields, locatePromptSpec)
    : JSON.stringify(param, null, 2)
}
</action-param-json>`;

export const defaultMidsceneActionOutputProtocol: PlanningActionOutputProtocol =
  {
    actionOutputTagNames: ['action-type', 'action-param-json'],
    actionOutputRules: [
      '- Use the <action-type> and <action-param-json> tags to output the action to be executed.',
      "- The value inside <action-type> MUST exactly match the 'type' field of one action in the Supporting actions list. 'complete' is NOT a valid action-type.",
      '- Parameter names are strict. Use EXACTLY the field names listed for the selected action. Do NOT invent alias fields. If the selected action provides a "sample" field, use the XML structure shown in that sample as the exact format for the action output.',
    ].join('\n'),
    actionOutputPlaceholder: [
      '<action-type>...</action-type>',
      '<action-param-json>...</action-param-json>',
    ].join('\n'),
    buildActionOutput: buildPlanningActionOutput,
  };
