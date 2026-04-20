import { parseBase64 } from '@midscene/shared/img';
import { z } from 'zod';
import {
  getZodDescription,
  getZodTypeName,
  isMidsceneLocatorField,
  unwrapZodField,
} from '../zod-schema-utils';
import { getErrorMessage } from './error-formatter';
import type {
  ActionSpaceItem,
  BaseAgent,
  ToolCliMetadata,
  ToolDefinition,
  ToolResult,
  ToolSchema,
} from './types';

/**
 * Generate MCP tool description from ActionSpaceItem
 * Format: "actionName action, description. Parameters: param1 (type) - desc; param2 (type) - desc"
 */
function describeActionForMCP(action: ActionSpaceItem): string {
  const actionDesc = action.description || `Execute ${action.name} action`;

  if (!action.paramSchema) {
    return `${action.name} action, ${actionDesc}`;
  }

  const shape = getZodObjectShape(action.paramSchema);
  if (!shape) {
    // Simple type schema
    const typeName = getZodTypeName(action.paramSchema);
    const description = getZodDescription(action.paramSchema as z.ZodTypeAny);
    const paramDesc = description ? `${typeName} - ${description}` : typeName;
    return `${action.name} action, ${actionDesc}. Parameter: ${paramDesc}`;
  }

  // Object schema with multiple fields
  const paramDescriptions: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    if (field && typeof field === 'object') {
      const isFieldOptional =
        typeof (field as { isOptional?: () => boolean }).isOptional ===
          'function' && (field as { isOptional: () => boolean }).isOptional();
      const typeName = getZodTypeName(field);
      const description = getZodDescription(field as z.ZodTypeAny);

      let paramStr = `${key}${isFieldOptional ? '?' : ''} (${typeName})`;
      if (description) {
        paramStr += ` - ${description}`;
      }
      paramDescriptions.push(paramStr);
    }
  }

  if (paramDescriptions.length === 0) {
    return `${action.name} action, ${actionDesc}`;
  }

  return `${action.name} action, ${actionDesc}. Parameters: ${paramDescriptions.join('; ')}`;
}

/**
 * Type guard: check if a Zod type is ZodOptional
 */
function isZodOptional(
  value: z.ZodTypeAny,
): value is z.ZodOptional<z.ZodTypeAny> {
  return '_def' in value && value._def?.typeName === 'ZodOptional';
}

/**
 * Type guard: check if a Zod type is ZodObject
 */
function isZodObject(value: z.ZodTypeAny): value is z.ZodObject<z.ZodRawShape> {
  return (
    '_def' in value && value._def?.typeName === 'ZodObject' && 'shape' in value
  );
}

/**
 * Unwrap ZodOptional to get inner type
 */
function unwrapOptional(value: z.ZodTypeAny): {
  innerValue: z.ZodTypeAny;
  isOptional: boolean;
} {
  if (isZodOptional(value)) {
    return { innerValue: value._def.innerType, isOptional: true };
  }
  return { innerValue: value, isOptional: false };
}

function getZodObjectShape(
  value: z.ZodTypeAny | undefined,
): Record<string, z.ZodTypeAny> | undefined {
  if (!value) {
    return undefined;
  }

  const actualValue = unwrapZodField(value) as {
    _def?: { typeName?: string; shape?: () => Record<string, z.ZodTypeAny> };
    shape?: Record<string, z.ZodTypeAny>;
  };

  if (actualValue._def?.typeName !== 'ZodObject') {
    return undefined;
  }

  if (typeof actualValue._def.shape === 'function') {
    return actualValue._def.shape();
  }

  return actualValue.shape;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Transform a locate field schema to make its 'prompt' field optional
 */
function makePromptOptional(
  shape: Record<string, z.ZodTypeAny>,
  wrapInOptional: boolean,
): z.ZodTypeAny {
  const newShape = { ...shape };
  newShape.prompt = shape.prompt.optional();

  let newSchema: z.ZodTypeAny = z.object(newShape).passthrough();
  if (wrapInOptional) {
    newSchema = newSchema.optional();
  }
  return newSchema;
}

/**
 * Transform schema field to make locate.prompt optional if applicable
 */
function transformSchemaField(
  key: string,
  value: z.ZodTypeAny,
): [string, z.ZodTypeAny] {
  const { innerValue, isOptional } = unwrapOptional(value);
  const shape = getZodObjectShape(innerValue);

  if (shape && isMidsceneLocatorField(innerValue)) {
    return [key, makePromptOptional(shape, isOptional)];
  }
  return [key, value];
}

/**
 * Extract and transform schema from action's paramSchema
 */
function extractActionSchema(
  paramSchema: z.ZodTypeAny | undefined,
): Record<string, z.ZodTypeAny> {
  if (!paramSchema) {
    return {};
  }

  const shape = getZodObjectShape(paramSchema);
  if (!shape) {
    return paramSchema as unknown as Record<string, z.ZodTypeAny>;
  }

  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) =>
      transformSchemaField(key, value as z.ZodTypeAny),
    ),
  );
}

function getPromptText(prompt: unknown): string | undefined {
  if (typeof prompt === 'string') {
    return prompt;
  }

  if (isRecord(prompt) && typeof prompt.prompt === 'string') {
    return prompt.prompt;
  }

  return undefined;
}

function moveLocateExtrasIntoPrompt(
  value: Record<string, unknown>,
  locateFieldKeys: Set<string>,
): Record<string, unknown> {
  const promptText = getPromptText(value.prompt);
  if (!promptText) {
    return value;
  }

  const normalizedPrompt: Record<string, unknown> = isRecord(value.prompt)
    ? { ...value.prompt }
    : { prompt: promptText };
  const normalizedLocate: Record<string, unknown> = {};
  let movedExtraField = false;

  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === 'prompt') {
      continue;
    }

    if (locateFieldKeys.has(key)) {
      normalizedLocate[key] = fieldValue;
      continue;
    }

    movedExtraField = true;
    if (!(key in normalizedPrompt)) {
      normalizedPrompt[key] = fieldValue;
    }
  }

  if (!movedExtraField) {
    return value;
  }

  return { ...normalizedLocate, prompt: normalizedPrompt };
}

function normalizeLocateLikeArg(
  value: unknown,
  fieldSchema: z.ZodTypeAny,
): unknown {
  if (typeof value === 'string') {
    return { prompt: value };
  }

  if (!isRecord(value)) {
    return value;
  }

  const shape = getZodObjectShape(fieldSchema);
  if (!shape) {
    return value;
  }

  return moveLocateExtrasIntoPrompt(value, new Set(Object.keys(shape)));
}

function normalizeActionArgs(
  args: Record<string, unknown>,
  paramSchema?: z.ZodTypeAny,
): Record<string, unknown> {
  if (!paramSchema) {
    return args;
  }

  const shape = getZodObjectShape(paramSchema);
  if (!shape) {
    return args;
  }

  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      const fieldSchema = shape[key] as z.ZodTypeAny | undefined;
      if (!fieldSchema) {
        return [key, value];
      }

      if (isMidsceneLocatorField(fieldSchema)) {
        return [key, normalizeLocateLikeArg(value, fieldSchema)];
      }

      return [key, value];
    }),
  );
}

/**
 * Serialize args to human-readable description for AI action
 */
function serializeArgsToDescription(args: Record<string, unknown>): string {
  try {
    return Object.entries(args)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          try {
            return `${key}: ${JSON.stringify(value)}`;
          } catch {
            // Circular reference or non-serializable object
            return `${key}: [object]`;
          }
        }
        return `${key}: "${value}"`;
      })
      .join(', ');
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Error serializing args:', errorMessage);
    return `[args serialization failed: ${errorMessage}]`;
  }
}

/**
 * Build action instruction as natural language for better AI planning flexibility.
 * Natural language instructions allow the planner to adjust strategies on replanning,
 * unlike rigid structured instructions that cause repeated identical failures.
 */
function buildActionInstruction(
  actionName: string,
  args: Record<string, unknown>,
): string {
  const locatePrompt = isRecord(args.locate)
    ? getPromptText(args.locate.prompt)
    : undefined;

  switch (actionName) {
    case 'Tap':
      return locatePrompt ? `Tap on "${locatePrompt}"` : 'Tap';
    case 'Input': {
      const value = args.value ?? args.content ?? '';
      return locatePrompt
        ? `Input "${value}" into "${locatePrompt}"`
        : `Input "${value}"`;
    }
    case 'Scroll': {
      const direction = args.direction ?? 'down';
      return locatePrompt
        ? `Scroll ${direction} on "${locatePrompt}"`
        : `Scroll ${direction}`;
    }
    case 'Hover':
      return locatePrompt ? `Hover over "${locatePrompt}"` : 'Hover';
    case 'KeyboardPress': {
      const key = args.value ?? args.key ?? '';
      return `Press key "${key}"`;
    }
    default: {
      const argsDescription = serializeArgsToDescription(args);
      return argsDescription ? `${actionName}: ${argsDescription}` : actionName;
    }
  }
}

async function executeAction(
  agent: BaseAgent,
  actionName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (agent.callActionInActionSpace) {
    return agent.callActionInActionSpace(actionName, args);
  }

  if (agent.aiAction) {
    const instruction = buildActionInstruction(actionName, args);
    return agent.aiAction(instruction);
  }

  throw new Error(`Action "${actionName}" is not supported by this agent`);
}

/**
 * Capture screenshot and return as tool result
 */
async function captureScreenshotResult(
  agent: BaseAgent,
  actionName: string,
  actionResult?: unknown,
): Promise<ToolResult> {
  const content: ToolResult['content'] = [
    { type: 'text', text: `Action "${actionName}" completed.` },
  ];

  if (actionResult !== undefined) {
    content.push({
      type: 'text',
      text: `Result: ${serializeActionResult(actionResult)}`,
    });
  }

  try {
    const screenshot = await agent.page?.screenshotBase64();
    if (!screenshot) {
      return { content };
    }

    const { mimeType, body } = parseBase64(screenshot);
    content.push({ type: 'image', data: body, mimeType });
    return { content };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Error capturing screenshot:', errorMessage);
    content[0] = {
      type: 'text',
      text: `Action "${actionName}" completed (screenshot unavailable: ${errorMessage})`,
    };
    return { content };
  }
}

function serializeActionResult(actionResult: unknown): string {
  if (typeof actionResult === 'string') {
    return actionResult;
  }

  try {
    return JSON.stringify(actionResult);
  } catch {
    return String(actionResult);
  }
}

/**
 * Create error result for tool handler
 */
function createErrorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Capture screenshot and return as a non-error result with warning message.
 * Used when an action fails but we want the AI agent to see the current state
 * and decide how to recover, rather than treating it as a hard error (exit code 1).
 */
async function captureFailureResult(
  agent: BaseAgent,
  actionName: string,
  errorMessage: string,
): Promise<ToolResult> {
  const warningText = `Warning: Action "${actionName}" failed: ${errorMessage}. Check the screenshot below for the current page state and decide how to proceed.`;
  try {
    const screenshot = await agent.page?.screenshotBase64();
    if (!screenshot) {
      return {
        content: [{ type: 'text', text: warningText }],
      };
    }
    const { mimeType, body } = parseBase64(screenshot);
    return {
      content: [
        { type: 'text', text: warningText },
        { type: 'image', data: body, mimeType },
      ],
    };
  } catch {
    return {
      content: [{ type: 'text', text: warningText }],
    };
  }
}

function mergeToolCliMetadata(
  base?: ToolCliMetadata,
  extra?: ToolCliMetadata,
): ToolCliMetadata | undefined {
  const options = {
    ...(base?.options ?? {}),
    ...(extra?.options ?? {}),
  };

  return Object.keys(options).length > 0 ? { options } : undefined;
}

/**
 * Converts DeviceAction from actionSpace into MCP ToolDefinition
 * This is the core logic that removes need for hardcoded tool definitions
 */
export function generateToolsFromActionSpace(
  actionSpace: ActionSpaceItem[],
  getAgent: (args?: Record<string, unknown>) => Promise<BaseAgent>,
  sanitizeArgs: (args: Record<string, unknown>) => Record<string, unknown> = (
    args,
  ) => args,
  initArgSchema: ToolSchema = {},
  initArgCliMetadata?: ToolCliMetadata,
): ToolDefinition[] {
  return actionSpace.map((action) => {
    const schema = {
      ...extractActionSchema(action.paramSchema as z.ZodTypeAny),
      ...initArgSchema,
    };

    return {
      name: action.name,
      description: describeActionForMCP(action),
      schema,
      cli: initArgCliMetadata,
      handler: async (args: Record<string, unknown>) => {
        try {
          const agent = await getAgent(args);
          const normalizedArgs = normalizeActionArgs(
            sanitizeArgs(args),
            action.paramSchema,
          );
          let actionResult: unknown;

          try {
            actionResult = await executeAction(
              agent,
              action.name,
              normalizedArgs,
            );
          } catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            console.error(
              `Error executing action "${action.name}":`,
              errorMessage,
            );
            // Return screenshot + warning instead of hard error,
            // so the AI agent can see current state and decide to retry or adjust strategy
            return await captureFailureResult(agent, action.name, errorMessage);
          }

          return await captureScreenshotResult(
            agent,
            action.name,
            actionResult,
          );
        } catch (error: unknown) {
          // Connection/agent errors are still hard errors
          const errorMessage = getErrorMessage(error);
          console.error(`Error in handler for "${action.name}":`, errorMessage);
          return createErrorResult(
            `Failed to get agent or execute action "${action.name}": ${errorMessage}`,
          );
        }
      },
    };
  });
}

/**
 * Generate common tools (screenshot, act)
 */
export function generateCommonTools(
  getAgent: (args?: Record<string, unknown>) => Promise<BaseAgent>,
  initArgSchema: ToolSchema = {},
  initArgCliMetadata?: ToolCliMetadata,
): ToolDefinition[] {
  return [
    {
      name: 'take_screenshot',
      description: 'Capture screenshot of current page/screen',
      schema: {
        ...initArgSchema,
      },
      cli: initArgCliMetadata,
      handler: async (
        args: Record<string, unknown> = {},
      ): Promise<ToolResult> => {
        try {
          const agent = await getAgent(args);
          const screenshot = await agent.page?.screenshotBase64();
          if (!screenshot) {
            return createErrorResult('Screenshot not available');
          }
          const { mimeType, body } = parseBase64(screenshot);
          return {
            content: [{ type: 'image', data: body, mimeType }],
          };
        } catch (error: unknown) {
          const errorMessage = getErrorMessage(error);
          console.error('Error taking screenshot:', errorMessage);
          return createErrorResult(
            `Failed to capture screenshot: ${errorMessage}`,
          );
        }
      },
    },
    {
      name: 'act',
      description:
        'Execute a natural language action. The AI will plan and perform multi-step operations in a single invocation, useful for transient UI interactions (e.g., Spotlight, dropdown menus) that disappear between separate commands.',
      schema: {
        prompt: z
          .string()
          .describe(
            'Natural language description of the action to perform, e.g. "press Command+Space, type Safari, press Enter"',
          ),
        ...initArgSchema,
      },
      cli: mergeToolCliMetadata(undefined, initArgCliMetadata),
      handler: async (
        args: Record<string, unknown> = {},
      ): Promise<ToolResult> => {
        const prompt = args.prompt as string;
        try {
          const agent = await getAgent(args);
          if (!agent.aiAction) {
            return createErrorResult('act is not supported by this agent');
          }
          const result = await agent.aiAction(prompt, { deepThink: false });
          const screenshotResult = await captureScreenshotResult(agent, 'act');
          if (result) {
            const message =
              typeof result === 'string' ? result : JSON.stringify(result);
            screenshotResult.content.unshift({
              type: 'text',
              text: `Task finished, message: ${message}`,
            });
          }
          return screenshotResult;
        } catch (error: unknown) {
          const errorMessage = getErrorMessage(error);
          console.error('Error executing act:', errorMessage);
          return createErrorResult(`Failed to execute act: ${errorMessage}`);
        }
      },
    },
  ];
}
