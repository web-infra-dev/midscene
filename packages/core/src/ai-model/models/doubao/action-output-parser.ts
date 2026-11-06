import type { DeviceAction, PlanningAction } from '@/types';
import {
  isMidsceneLocatorField,
  unwrapZodField,
} from '@midscene/shared/zod-schema-utils';
import type { ParsedPlanningLocateParameter } from '../../model-adapter/planning-protocol';
import type { JsonParser } from '../../shared/json';
import { parseDoubaoToolCall } from './tool-call-parser';

const getActionParameterSchema = (
  actionSpace: DeviceAction<any>[],
  actionName: string,
  parameterName: string,
) => {
  const action = actionSpace.find(({ name }) => name === actionName);
  if (!action?.paramSchema) {
    return undefined;
  }

  const schema = unwrapZodField(action.paramSchema) as {
    _def?: {
      typeName?: string;
      shape?: () => Record<string, unknown>;
    };
    shape?: Record<string, unknown>;
  };
  if (schema?._def?.typeName !== 'ZodObject') {
    return undefined;
  }

  const shape =
    typeof schema._def.shape === 'function'
      ? schema._def.shape()
      : schema.shape;
  return shape?.[parameterName];
};

const schemaUsesStringValue = (schema: unknown): boolean => {
  if (!schema) {
    return false;
  }

  if (isMidsceneLocatorField(schema)) {
    return true;
  }

  const actualSchema = unwrapZodField(schema) as {
    _def?: {
      typeName?: string;
      options?: unknown[];
      value?: unknown;
    };
  };
  if (
    actualSchema._def?.typeName === 'ZodString' ||
    actualSchema._def?.typeName === 'ZodEnum'
  ) {
    return true;
  }

  if (actualSchema._def?.typeName === 'ZodLiteral') {
    return typeof actualSchema._def.value === 'string';
  }

  return (
    actualSchema._def?.typeName === 'ZodUnion' &&
    (actualSchema._def.options ?? []).some(schemaUsesStringValue)
  );
};

const parseDoubaoParameterValue = (
  content: string,
  {
    isString,
    parameterSchema,
    jsonParser,
  }: {
    isString: boolean | undefined;
    parameterSchema: unknown;
    jsonParser: JsonParser;
  },
) => {
  if (
    isString === true ||
    (isString === undefined && schemaUsesStringValue(parameterSchema))
  ) {
    return content;
  }

  if (isString === undefined && !parameterSchema) {
    throw new Error('cannot infer parameter type without an action schema');
  }

  return jsonParser(content, {
    source: 'planning-action-param',
  });
};

export const parseDoubaoRawLocateParameter = (
  value: unknown,
): ParsedPlanningLocateParameter => {
  if (typeof value !== 'string') {
    throw new Error('Seed planning locator parameter must be a string');
  }

  const promptMatch = value.match(/<prompt>([\s\S]*?)<\/prompt>/i);
  const pointMatches = Array.from(
    value.matchAll(/<point>\s*\d+\s+\d+\s*<\/point>/gi),
  );
  if (!promptMatch && pointMatches.length === 0) {
    throw new Error(
      'Seed planning locator parameter requires <prompt> or <point>',
    );
  }

  const locateParameter: {
    prompt?: string;
    point?: string;
  } = {};

  if (promptMatch) {
    locateParameter.prompt = promptMatch[1];
  }
  if (pointMatches.length > 0) {
    locateParameter.point = pointMatches.map((match) => match[0]).join('');
  }

  return locateParameter;
};

export const createDoubaoPlanningActionOutputParser =
  (jsonParser: JsonParser) =>
  (
    content: string,
    actionSpace: DeviceAction<any>[],
  ): PlanningAction | null => {
    const toolCall = parseDoubaoToolCall(content);
    if (!toolCall) {
      return null;
    }

    const param = Object.fromEntries(
      toolCall.parameters.map(({ name, isString, rawValue }) => {
        try {
          return [
            name,
            parseDoubaoParameterValue(rawValue, {
              isString,
              parameterSchema: getActionParameterSchema(
                actionSpace,
                toolCall.functionName,
                name,
              ),
              jsonParser,
            }),
          ] as const;
        } catch (error) {
          throw new Error(`Failed to parse Seed parameter "${name}": ${error}`);
        }
      }),
    );

    return {
      type: toolCall.functionName,
      ...(Object.keys(param).length > 0 ? { param } : {}),
    };
  };
