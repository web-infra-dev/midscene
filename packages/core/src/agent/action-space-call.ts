import type { DeviceAction } from '../types';
import {
  buildDetailedLocateParam,
  buildDetailedLocateParamAndRestParams,
} from '../yaml/utils';

const isStringParamSchema = (schema?: DeviceAction['paramSchema']): boolean => {
  if (!schema) return false;

  const schemaDef = (schema as any)?._def;
  if (!schemaDef?.typeName) return false;

  switch (schemaDef.typeName) {
    case 'ZodString':
    case 'ZodEnum':
    case 'ZodNativeEnum':
      return true;
    case 'ZodLiteral':
      return typeof schemaDef.value === 'string';
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return isStringParamSchema(schemaDef.innerType);
    case 'ZodEffects':
      return isStringParamSchema(schemaDef.schema);
    case 'ZodPipeline':
      return isStringParamSchema(schemaDef.out);
    case 'ZodUnion': {
      const options = schemaDef.options as DeviceAction['paramSchema'][];
      return options.every((option) => isStringParamSchema(option));
    }
    default:
      return false;
  }
};

const shortcutField = (action: DeviceAction): 'uri' | 'command' | undefined =>
  action.name === 'Launch' || action.name === 'Terminate'
    ? 'uri'
    : action.name === 'RunAdbShell' || action.name === 'RunHdcShell'
      ? 'command'
      : undefined;

/**
 * Resolve the public `action` Node against the current Agent ActionSpace.
 *
 * A legacy YAML document is collected before its Agent exists, so action
 * aliases and their old string/object shorthand must be resolved here, where
 * the platform schema is available. Native Test calls that already satisfy the
 * action schema pass through unchanged.
 */
export const normalizeActionSpaceCall = (
  type: string,
  input: unknown,
  actionSpace: readonly DeviceAction[],
): { actionType: string; actionParam: unknown } => {
  const action =
    actionSpace.find((item) => item.name === type) ??
    actionSpace.find((item) => item.interfaceAlias === type);
  if (!action) return { actionType: type, actionParam: input };

  const field = shortcutField(action);
  if (field && typeof input === 'string') {
    return { actionType: action.name, actionParam: { [field]: input } };
  }

  if (isStringParamSchema(action.paramSchema)) {
    return { actionType: action.name, actionParam: input };
  }

  if (action.paramSchema?.safeParse(input).success) {
    return { actionType: action.name, actionParam: input };
  }

  if (typeof input === 'string') {
    return {
      actionType: action.name,
      actionParam: { locate: buildDetailedLocateParam(input, {}) },
    };
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const options = input as Record<string, any>;
    const prompt = typeof options.prompt === 'string' ? options.prompt : '';
    if (prompt || options.locate) {
      const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(
        prompt,
        options,
        [action.name, action.interfaceAlias ?? ''],
      );
      return {
        actionType: action.name,
        actionParam: { ...restParams, locate: locateParam },
      };
    }
  }

  return { actionType: action.name, actionParam: input };
};
