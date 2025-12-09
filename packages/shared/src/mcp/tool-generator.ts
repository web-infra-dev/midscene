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
            const instruction = buildActionInstruction(action.name, args);
            try {
              await agent.aiAction(instruction);
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
      autoDestroy: true,
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
      autoDestroy: true,
    },
  ];
}
