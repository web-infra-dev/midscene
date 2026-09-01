import {
  getZodDescription,
  getZodTypeName,
  isMidsceneLocatorField,
} from '@midscene/shared/zod-schema-utils';
import type { z } from 'zod';
import { getZodDefaultValue } from '../shared/action-schema';
import type { JsonParser } from '../shared/json';
import {
  type LocateResultPromptSpec,
  formatLocateExampleValue,
} from '../shared/model-locate-result';
import { extractXMLTag } from '../shared/xml';
import type {
  ParsedPlanningLocateParameter,
  PlanningActionDescriptionBuildInput,
  PlanningActionOutputBuildInput,
  StandardPlanningProtocolFactory,
} from './planning-protocol';

type ActionParamDescription = {
  type: string;
  optional?: true;
  description?: string;
  default?: unknown;
  instruction?: string;
};

type ActionDescription = {
  type: string;
  description: string;
  param?: Record<string, ActionParamDescription> | ActionParamDescription;
  sample?: string;
};

export const buildActionDescription = ({
  action,
  locateFieldDescription,
  actionOutputExample,
}: PlanningActionDescriptionBuildInput) => {
  const actionDescription: ActionDescription = {
    type: action.name,
    description: action.description || 'No description provided',
  };

  if (action.paramSchema) {
    const schema = action.paramSchema as {
      _def?: { typeName?: string };
      shape?: Record<string, unknown>;
    };
    const isZodObject = schema._def?.typeName === 'ZodObject';

    if (isZodObject && schema.shape) {
      const param: Record<string, ActionParamDescription> = {};

      for (const [key, field] of Object.entries(schema.shape)) {
        if (field && typeof field === 'object') {
          const isOptional =
            typeof (field as { isOptional?: () => boolean }).isOptional ===
              'function' &&
            (field as { isOptional: () => boolean }).isOptional();
          // Deliberately do not resolve locators nested in ZodUnion here:
          // findAllMidsceneLocatorField does not recognize them either, so
          // describing them as locators would diverge from the execution path.
          const typeDescription = isMidsceneLocatorField(field)
            ? locateFieldDescription
            : getZodTypeName(field);
          const description = getZodDescription(field as z.ZodTypeAny);
          const defaultValue = getZodDefaultValue(field);
          const hasDefault = defaultValue !== undefined;

          const paramDescription: ActionParamDescription = {
            type: typeDescription,
          };
          if (isOptional) {
            paramDescription.optional = true;
          }
          if (description) {
            paramDescription.description = description;
          }
          if (hasDefault) {
            paramDescription.default = defaultValue;
          }

          param[key] = paramDescription;
        }
      }

      if (Object.keys(param).length > 0) {
        actionDescription.param = param;
      }
    } else {
      const typeName = getZodTypeName(schema);
      const description = getZodDescription(schema as z.ZodTypeAny);
      const paramDescription: ActionParamDescription = {
        type: typeName,
        instruction: 'Pass the value directly, not as an object.',
      };
      if (description) {
        paramDescription.description = description;
      }
      actionDescription.param = paramDescription;
    }
  }

  if (actionOutputExample) {
    actionDescription.sample = actionOutputExample;
  }

  return actionDescription;
};

export const buildLocateFieldDescription = (
  promptSpec?: LocateResultPromptSpec,
) => {
  if (promptSpec) {
    return `{ prompt: string, ${promptSpec.resultKey}: ${promptSpec.resultValueSchema} /* ${promptSpec.resultValueDescription} */ }`;
  }
  return '{ prompt: string /* description of the target element */ }';
};

const serializeActionParam = (
  param: Record<string, unknown>,
  locateFields: string[],
  locateResultKey: string,
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
      if (locatorObjects.has(this) && key === locateResultKey) {
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

export const buildPlanningActionOutput = ({
  actionName,
  param,
  locateFields,
  locateResultKey,
}: PlanningActionOutputBuildInput) => `<action-type>${actionName}</action-type>
<action-param-json>
${
  // Keep locate result arrays on one line when serializing action examples.
  locateFields && locateResultKey
    ? serializeActionParam(param, locateFields, locateResultKey)
    : JSON.stringify(param, null, 2)
}
</action-param-json>`;

export const createMidscenePlanningActionOutputParser =
  (jsonParser: JsonParser) => (content: string) => {
    const actionType = extractXMLTag(content, 'action-type');
    const actionParamStr = extractXMLTag(content, 'action-param-json');

    if (!actionType || actionType.toLowerCase() === 'null') {
      return null;
    }

    // Strip any trailing XML tags that leaked into the action type.
    const type = actionType.split('<')[0].trim();
    let param: any = undefined;

    if (actionParamStr) {
      try {
        param = jsonParser(actionParamStr, {
          source: 'planning-action-param',
          requireObject: false,
          preserveStringValueKeys:
            type.toLowerCase() === 'input' ? ['value'] : undefined,
        });
      } catch (error) {
        throw new Error(`Failed to parse action-param-json: ${error}`);
      }
    }

    return {
      type,
      ...(param !== undefined ? { param } : {}),
    };
  };

export const createDefaultMidscenePlanningProtocol: StandardPlanningProtocolFactory =
  ({ jsonParser }) => {
    const parseActionOutput =
      createMidscenePlanningActionOutputParser(jsonParser);

    return {
      actionSpaceProtocol: {
        title: 'Supporting actions list',
        format: 'yaml',
        includeActionOutputExample: true,
        buildLocateFieldDescription,
        buildActionDescription,
      },
      actionOutputProtocol: {
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
        parseActionOutput,
        parseRawLocateParameter: (value) =>
          value as ParsedPlanningLocateParameter,
      },
    };
  };
