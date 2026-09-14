import {
  TUserPromptSchema,
  findActionInActionSpaceOrThrow,
  findAllMidsceneLocatorField,
  parseActionParam,
  validateRequiredLocateFields,
} from '@/common';
import type { DeviceAction, PlanningAction } from '@/types';
import { isPlainObject } from '@midscene/shared/utils';
import { z } from 'zod';

export function validatePlanningActions(
  actions: PlanningAction[],
  actionSpace: DeviceAction[],
): void {
  for (const action of actions) {
    const definition = findActionInActionSpaceOrThrow(action.type, actionSpace);
    if (!definition.paramSchema) {
      continue;
    }

    try {
      validateRequiredLocateFields(action.param, definition.paramSchema);
      // Only preflight validation: keep model parameters unchanged. Parsing can
      // evaluate defaults/transforms, but its output is consumed only at execution.
      parseActionParam(action.param, definition.paramSchema);

      for (const field of findAllMidsceneLocatorField(definition.paramSchema)) {
        const locate = action.param?.[field];
        if (!locate) {
          continue;
        }
        // Validate only the model-facing prompt; coordinates are normalized later.
        if (!isPlainObject(locate)) {
          throw new Error(`${field}: Expected an object with a prompt field`);
        }
        const prompt = locate.prompt;
        if (prompt === undefined) {
          throw new Error(`${field}.prompt: Required`);
        }
        const result = TUserPromptSchema.safeParse(prompt);
        if (!result.success) {
          throw new z.ZodError(
            result.error.issues.map((issue) => ({
              ...issue,
              path: [field, 'prompt', ...issue.path],
            })),
          );
        }
      }
    } catch (error) {
      const details =
        error instanceof z.ZodError
          ? error.issues
              .map(
                (issue) =>
                  `${issue.path.join('.') || 'param'}: ${issue.message}`,
              )
              .join('; ')
          : error instanceof Error
            ? error.message
            : String(error);
      throw new Error(
        `Invalid parameters for action ${action.type}: ${details}`,
        { cause: error },
      );
    }
  }
}
