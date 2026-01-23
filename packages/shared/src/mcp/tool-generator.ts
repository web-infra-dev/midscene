import { parseBase64 } from '@midscene/shared/img';
import { z } from 'zod';
import { getZodDescription, getZodTypeName } from '../zod-schema-utils';
import type {
  ActionSpaceItem,
  BaseAgent,
  ToolDefinition,
  ToolResult,
} from './types';

/**
 * Extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Generate MCP tool description from ActionSpaceItem
 * Format: "actionName action, description. Parameters: param1 (type) - desc; param2 (type) - desc"
 */
function describeActionForMCP(action: ActionSpaceItem): string {
  const actionDesc = action.description || `Execute ${action.name} action`;

  if (!action.paramSchema) {
    return `${action.name} action, ${actionDesc}`;
  }

  const schema = action.paramSchema as {
    _def?: { typeName?: string };
    shape?: Record<string, unknown>;
  };
  const isZodObjectType = schema._def?.typeName === 'ZodObject';

  if (!isZodObjectType || !schema.shape) {
    // Simple type schema
    const typeName = getZodTypeName(schema);
    const description = getZodDescription(schema as z.ZodTypeAny);
    const paramDesc = description ? `${typeName} - ${description}` : typeName;
    return `${action.name} action, ${actionDesc}. Parameter: ${paramDesc}`;
  }

  // Object schema with multiple fields
  const paramDescriptions: string[] = [];
  for (const [key, field] of Object.entries(schema.shape)) {
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

/**
 * Check if a Zod object schema contains a 'prompt' field (locate field pattern)
 */
function isLocateField(value: z.ZodTypeAny): boolean {
  if (!isZodObject(value)) {
    return false;
  }
  return 'prompt' in value.shape;
}

/**
 * Transform a locate field schema to make its 'prompt' field optional
 */
function makePromptOptional(
  value: z.ZodObject<z.ZodRawShape>,
  wrapInOptional: boolean,
): z.ZodTypeAny {
  const newShape = { ...value.shape };
  newShape.prompt = value.shape.prompt.optional();

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

  if (isZodObject(innerValue) && isLocateField(innerValue)) {
    return [key, makePromptOptional(innerValue, isOptional)];
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

  const schema = paramSchema as z.ZodTypeAny;
  if (!isZodObject(schema)) {
    return schema as unknown as Record<string, z.ZodTypeAny>;
  }

  return Object.fromEntries(
    Object.entries(schema.shape).map(([key, value]) =>
      transformSchemaField(key, value as z.ZodTypeAny),
    ),
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
 * Build action instruction string from action name and args
 */
function buildActionInstruction(
  actionName: string,
  args: Record<string, unknown>,
): string {
  const argsDescription = serializeArgsToDescription(args);
  return argsDescription
    ? `Use the action "${actionName}" with ${argsDescription}`
    : `Use the action "${actionName}"`;
}

/**
 * Capture screenshot and return as tool result
 */
async function captureScreenshotResult(
  agent: BaseAgent,
  actionName: string,
): Promise<ToolResult> {
  try {
    const screenshot = await agent.page?.screenshotBase64();
    if (!screenshot) {
      return {
        content: [{ type: 'text', text: `Action "${actionName}" completed.` }],
      };
    }

    const { mimeType, body } = parseBase64(screenshot);
    return {
      content: [
        { type: 'text', text: `Action "${actionName}" completed.` },
        { type: 'image', data: body, mimeType },
      ],
    };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Error capturing screenshot:', errorMessage);
    return {
      content: [
        {
          type: 'text',
          text: `Action "${actionName}" completed (screenshot unavailable: ${errorMessage})`,
        },
      ],
    };
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
 * Check if agent has a specific method by name
 */
function hasAgentMethod(agent: BaseAgent, methodName: string): boolean {
  return (
    typeof agent === 'object' &&
    agent !== null &&
    methodName in agent &&
    typeof (agent as unknown as Record<string, unknown>)[methodName] ===
      'function'
  );
}

/**
 * Extract locate prompt from args
 * Supports both direct prompt string and locate object with prompt field
 */
function extractLocatePrompt(args: Record<string, unknown>): string | undefined {
  // Check for locate.prompt
  if (
    args.locate &&
    typeof args.locate === 'object' &&
    'prompt' in args.locate &&
    typeof args.locate.prompt === 'string'
  ) {
    return args.locate.prompt;
  }
  // Check for direct prompt field (for backward compatibility)
  if (typeof args.prompt === 'string') {
    return args.prompt;
  }
  return undefined;
}

/**
 * Convert MCP args to parameters for specific agent methods
 */
function convertArgsForMethod(
  methodName: string,
  args: Record<string, unknown>,
): [string | undefined, Record<string, unknown>] {
  const locatePrompt = extractLocatePrompt(args);

  switch (methodName) {
    case 'aiTap':
    case 'aiRightClick':
    case 'aiDoubleClick':
    case 'aiHover': {
      // These methods take: (locatePrompt, opt?)
      const opt: Record<string, unknown> = {};
      if (args.deepThink !== undefined) opt.deepThink = args.deepThink;
      if (args.cacheable !== undefined) opt.cacheable = args.cacheable;
      if (args.fileChooserAccept !== undefined)
        opt.fileChooserAccept = args.fileChooserAccept;
      return [locatePrompt, opt];
    }

    case 'aiInput': {
      // aiInput(locatePrompt, opt) where opt contains value
      // value is required for aiInput, use empty string as default if not provided
      const opt: Record<string, unknown> = {
        value: args.value ?? '',
      };
      if (args.mode !== undefined) opt.mode = args.mode;
      if (args.autoDismissKeyboard !== undefined)
        opt.autoDismissKeyboard = args.autoDismissKeyboard;
      if (args.deepThink !== undefined) opt.deepThink = args.deepThink;
      if (args.cacheable !== undefined) opt.cacheable = args.cacheable;
      return [locatePrompt, opt];
    }

    case 'aiKeyboardPress': {
      // aiKeyboardPress(locatePrompt, opt) where opt contains keyName
      // keyName is required for aiKeyboardPress
      if (!args.keyName || typeof args.keyName !== 'string') {
        throw new Error('keyName is required for aiKeyboardPress');
      }
      const opt: Record<string, unknown> = {
        keyName: args.keyName,
      };
      if (args.deepThink !== undefined) opt.deepThink = args.deepThink;
      if (args.cacheable !== undefined) opt.cacheable = args.cacheable;
      return [locatePrompt, opt];
    }

    case 'aiScroll': {
      // aiScroll(locatePrompt | undefined, opt) where opt contains scroll parameters
      // Note: locatePrompt is optional for aiScroll, but opt is required
      const opt: Record<string, unknown> = {};
      if (args.direction !== undefined) opt.direction = args.direction;
      if (args.scrollType !== undefined) opt.scrollType = args.scrollType;
      if (args.distance !== undefined) opt.distance = args.distance;
      if (args.deepThink !== undefined) opt.deepThink = args.deepThink;
      if (args.cacheable !== undefined) opt.cacheable = args.cacheable;
      // aiScroll requires opt parameter even if locatePrompt is undefined
      return [locatePrompt, opt];
    }

    default:
      // For unknown methods, return args as-is
      return [locatePrompt, args];
  }
}

/**
 * Call specific agent method if available, otherwise fall back to aiAction
 */
async function executeActionWithMethod(
  agent: BaseAgent,
  action: ActionSpaceItem,
  args: Record<string, unknown>,
): Promise<void> {
  // Check if action has interfaceAlias and agent has the corresponding method
  if (action.interfaceAlias && hasAgentMethod(agent, action.interfaceAlias)) {
    const method = (agent as unknown as Record<string, unknown>)[
      action.interfaceAlias
    ] as (...args: unknown[]) => Promise<unknown>;

    // Bind the method to agent to preserve 'this' context
    const boundMethod = method.bind(agent);

    try {
      const [locatePrompt, opt] = convertArgsForMethod(
        action.interfaceAlias,
        args,
      );

      // Call the method with appropriate parameters
      // Special handling for methods that require opt parameter even without locatePrompt
      if (action.interfaceAlias === 'aiScroll') {
        // aiScroll requires opt parameter, locatePrompt is optional
        await boundMethod(locatePrompt, opt);
      } else if (locatePrompt !== undefined) {
        // Methods that require locatePrompt
        if (Object.keys(opt).length > 0) {
          await boundMethod(locatePrompt, opt);
        } else {
          await boundMethod(locatePrompt);
        }
      } else {
        // Methods that don't require locatePrompt (shouldn't happen for most actions)
        if (Object.keys(opt).length > 0) {
          await boundMethod(opt);
        } else {
          await boundMethod();
        }
      }
      return;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `Error calling ${action.interfaceAlias} for action "${action.name}":`,
        errorMessage,
      );
      // Fall through to aiAction as fallback
    }
  }

  // Fallback to aiAction if method doesn't exist or call failed
  if (agent.aiAction) {
    const instruction = buildActionInstruction(action.name, args);
    await agent.aiAction(instruction);
  } else {
    throw new Error(
      `No method available to execute action "${action.name}". Neither ${action.interfaceAlias || 'specific method'} nor aiAction is available.`,
    );
  }
}

/**
 * Converts DeviceAction from actionSpace into MCP ToolDefinition
 * This is the core logic that removes need for hardcoded tool definitions
 */
export function generateToolsFromActionSpace(
  actionSpace: ActionSpaceItem[],
  getAgent: () => Promise<BaseAgent>,
): ToolDefinition[] {
  return actionSpace.map((action) => {
    const schema = extractActionSchema(action.paramSchema as z.ZodTypeAny);

    return {
      name: action.name,
      description: describeActionForMCP(action),
      schema,
      handler: async (args: Record<string, unknown>) => {
        try {
          const agent = await getAgent();
          
          if (agent.aiAction) {
            try {
              await executeActionWithMethod(agent, action, args);
            } catch (error: unknown) {
              const errorMessage = getErrorMessage(error);
              console.error(
                `Error executing action "${action.name}":`,
                errorMessage,
              );
              return createErrorResult(
                `Failed to execute action "${action.name}": ${errorMessage}`,
              );
            }
          }

          return await captureScreenshotResult(agent, action.name);
        } catch (error: unknown) {
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
 * Generate common tools (screenshot, waitFor)
 * SIMPLIFIED: Only keep essential helper tools, removed assert
 */
export function generateCommonTools(
  getAgent: () => Promise<BaseAgent>,
): ToolDefinition[] {
  return [
    {
      name: 'take_screenshot',
      description: 'Capture screenshot of current page/screen',
      schema: {},
      handler: async (): Promise<ToolResult> => {
        try {
          const agent = await getAgent();
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
  ];
}
