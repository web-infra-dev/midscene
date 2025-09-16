/**
 * Code generation utilities for converting API calls to executable code
 */

import { z } from 'zod';
import type { DeviceAction } from '../types';

export interface CodeGenerationOptions {
  language: 'javascript' | 'yaml';
  includeComments?: boolean;
  includeImports?: boolean;
  actionSpace?: DeviceAction[];
}

export interface GeneratedCode {
  javascript: string;
  yaml: string;
}

export interface AIActionDecomposition {
  steps: Array<{
    action: string;
    description: string;
    parameters?: Record<string, any>;
  }>;
}

/**
 * Filter parameters to only include relevant API parameters
 */
function filterApiParameters(
  parameters: Record<string, any>,
): Record<string, any> {
  const filtered: Record<string, any> = {};

  // List of allowed parameter keys for API calls
  const allowedKeys = [
    'prompt',
    'value',
    'key',
    'direction',
    'distance',
    'timeout',
    'locate',
    'text',
    'selector',
    'options',
    'data',
    'query',
  ];

  for (const [key, value] of Object.entries(parameters)) {
    // Skip UI-related parameters like CSS styles, DOM elements, etc.
    if (
      allowedKeys.includes(key) &&
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      // For object values, only include if they look like API parameters
      if (typeof value === 'object' && value !== null) {
        // Skip if it looks like a DOM element or CSS style object
        if (
          !('style' in value) &&
          !('className' in value) &&
          !('tagName' in value)
        ) {
          filtered[key] = value;
        }
      } else {
        filtered[key] = value;
      }
    }
  }

  return filtered;
}

/**
 * Extract parameter information from Zod schema
 */
function extractParametersFromSchema(
  paramSchema?: z.ZodType,
): Record<string, any> {
  if (!paramSchema) return {};

  // Handle ZodObject specifically
  if (paramSchema instanceof z.ZodObject) {
    const shape = paramSchema.shape;
    const params: Record<string, any> = {};

    for (const [key, field] of Object.entries(shape)) {
      // Get field information for code generation
      params[key] = {
        field,
        required: !isOptionalField(field as z.ZodType),
      };
    }

    return params;
  }

  return {};
}

/**
 * Check if a Zod field is optional
 */
function isOptionalField(field: z.ZodType): boolean {
  return field instanceof z.ZodOptional || field instanceof z.ZodDefault;
}

/**
 * Generate code parameters based on actionSpace and user parameters
 */
function generateCodeParameters(
  action: DeviceAction | undefined,
  userParameters: Record<string, any>,
): Record<string, any> {
  if (!action || !action.paramSchema) {
    return filterApiParameters(userParameters);
  }

  const schemaParams = extractParametersFromSchema(action.paramSchema);
  const result: Record<string, any> = {};

  // Map user parameters to schema parameters
  for (const [key, schemaInfo] of Object.entries(schemaParams)) {
    if (
      userParameters[key] !== undefined &&
      userParameters[key] !== null &&
      userParameters[key] !== ''
    ) {
      result[key] = userParameters[key];
    }
  }

  // Handle legacy prompt parameter mapping
  if (userParameters.prompt && !result.locate && !result.query) {
    // Check if schema has a 'locate' field (common in UI actions)
    if (schemaParams.locate) {
      result.locate = userParameters.prompt;
    } else if (schemaParams.query) {
      result.query = userParameters.prompt;
    } else {
      // Fallback: use prompt directly if no specific field matches
      result.prompt = userParameters.prompt;
    }
  }

  return result;
}

/**
 * Convert API call parameters to JavaScript code using actionSpace
 */
export function generateJavaScriptCode(
  actionType: string,
  parameters: Record<string, any>,
  options: CodeGenerationOptions = { language: 'javascript' },
): string {
  const {
    includeComments = true,
    includeImports = true,
    actionSpace,
  } = options;

  // Find action in actionSpace
  const action = actionSpace?.find(
    (a) => a.name === actionType || a.interfaceAlias === actionType,
  );

  // Generate parameters based on actionSpace if available
  const cleanParameters = action
    ? generateCodeParameters(action, parameters)
    : filterApiParameters(parameters);

  let code = '';

  // Add imports if requested - imports are not needed for agent-based code
  // if (includeImports) {
  //   code += "// Agent instance should be available in your context\n\n";
  // }

  // Add comment if requested
  if (includeComments) {
    const description = action?.description || `${actionType} action`;
    code += `// ${description}\n`;
  }

  // Generate the API call using actionSpace information
  if (action) {
    code += generateJavaScriptCallFromAction(action, cleanParameters);
  } else {
    // Fallback generation when action is not found in actionSpace
    code += generateFallbackJavaScriptCall(actionType, cleanParameters);
  }

  return code;
}

/**
 * Generate fallback JavaScript call when action is not found in actionSpace
 */
function generateFallbackJavaScriptCall(
  actionType: string,
  parameters: Record<string, any>,
): string {
  // For aiAction, use the prompt directly
  if (actionType === 'aiAction' && parameters.prompt) {
    return `await agent.aiAction(${JSON.stringify(parameters.prompt)});`;
  }
  
  // For other actions, generate based on common patterns
  if (Object.keys(parameters).length === 0) {
    return `await agent.${actionType}();`;
  } else if (Object.keys(parameters).length === 1) {
    const [key, value] = Object.entries(parameters)[0];
    if (key === 'prompt' || key === 'locate' || key === 'query') {
      return `await agent.${actionType}(${JSON.stringify(value)});`;
    }
  }
  
  // Fallback to object notation
  const paramStr = JSON.stringify(parameters, null, 2).replace(/\n/g, '\n  ');
  return `await agent.${actionType}(${paramStr});`;
}

/**
 * Generate JavaScript function call based on action type and parameters
 */
function generateJavaScriptCallFromAction(
  action: DeviceAction,
  parameters: Record<string, any>,
): string {
  const methodName = action.interfaceAlias || action.name;

  // Handle different parameter patterns based on method name
  if (Object.keys(parameters).length === 0) {
    return `await agent.${methodName}();`;
  }

  // Special handling for specific methods
  switch (methodName) {
    case 'aiInput': {
      // aiInput(locate, value) or aiInput(locate, { value: "text" })
      if (parameters.locate && parameters.value) {
        return `await agent.aiInput(${JSON.stringify(parameters.locate)}, {\n    "value": ${JSON.stringify(parameters.value)}\n  });`;
      } else if (parameters.value) {
        // Only value provided, use object notation
        return `await agent.aiInput({\n    "value": ${JSON.stringify(parameters.value)}\n  });`;
      } else if (parameters.locate) {
        return `await agent.aiInput(${JSON.stringify(parameters.locate)});`;
      }
      break;
    }

    case 'aiTap':
    case 'aiHover':
    case 'aiRightClick':
    case 'aiDoubleClick':
    case 'aiLocate': {
      // These methods take locate as first parameter
      if (parameters.locate) {
        return `await agent.${methodName}(${JSON.stringify(parameters.locate)});`;
      }
      break;
    }

    case 'aiScroll': {
      // aiScroll(locate, options) or aiScroll(options)
      if (parameters.locate && parameters.direction) {
        return `await agent.aiScroll(${JSON.stringify(parameters.locate)}, { direction: ${JSON.stringify(parameters.direction)} });`;
      } else if (parameters.direction) {
        return `await agent.aiScroll({ direction: ${JSON.stringify(parameters.direction)} });`;
      } else if (parameters.locate) {
        return `await agent.aiScroll(${JSON.stringify(parameters.locate)});`;
      }
      break;
    }

    case 'aiKeyboardPress': {
      // aiKeyboardPress(key, locate) or aiKeyboardPress(key)
      if (parameters.locate && parameters.key) {
        return `await agent.aiKeyboardPress(${JSON.stringify(parameters.key)}, ${JSON.stringify(parameters.locate)});`;
      } else if (parameters.key) {
        return `await agent.aiKeyboardPress(${JSON.stringify(parameters.key)});`;
      }
      break;
    }

    default: {
      // For other methods, use default handling
      if (Object.keys(parameters).length === 1) {
        const [key, value] = Object.entries(parameters)[0];
        if (key === 'locate' || key === 'query' || key === 'assertion') {
          return `await agent.${methodName}(${JSON.stringify(value)});`;
        }
      }

      // Multiple parameters - use object notation
      const paramStr = JSON.stringify(parameters, null, 2).replace(
        /\n/g,
        '\n  ',
      );
      return `await agent.${methodName}(${paramStr});`;
    }
  }

  // Fallback
  const paramStr = JSON.stringify(parameters, null, 2).replace(/\n/g, '\n  ');
  return `await agent.${methodName}(${paramStr});`;
}

/**
 * Convert API call parameters to YAML code using actionSpace
 */
export function generateYAMLCode(
  actionType: string,
  parameters: Record<string, any>,
  options: CodeGenerationOptions = { language: 'yaml' },
): string {
  const { includeComments = true, actionSpace } = options;

  // Find action in actionSpace
  const action = actionSpace?.find(
    (a) => a.name === actionType || a.interfaceAlias === actionType,
  );

  // Generate parameters based on actionSpace if available
  const cleanParameters = action
    ? generateCodeParameters(action, parameters)
    : filterApiParameters(parameters);

  let yaml = '';

  // Add comment if requested
  if (includeComments) {
    const description = action?.description || `${actionType} action`;
    yaml += `# ${description}\n`;
  }

  // Generate YAML structure in flow format
  yaml += generateYAMLFlowStructure(actionType, cleanParameters, action);

  return yaml;
}

/**
 * Generate YAML flow structure based on action type and parameters
 */
function generateYAMLFlowStructure(
  actionType: string,
  parameters: Record<string, any>,
  action?: DeviceAction,
): string {
  // Create a descriptive name based on the action and prompt
  let taskName = 'execute action';
  if (actionType === 'aiAction' && parameters.prompt) {
    // Keep original prompt for non-English text like Chinese
    taskName = parameters.prompt.trim();
    if (!taskName) taskName = 'ai action'; // fallback if prompt is empty
  } else if (parameters.prompt) {
    taskName = `${actionType.replace('ai', '').toLowerCase()} - ${parameters.prompt}`;
  } else {
    taskName = actionType.replace('ai', '').toLowerCase() + ' action';
  }

  let yaml = `- name: ${taskName}\n`;
  yaml += '  flow:\n';
  
  // Generate the action in flow format
  const actionLine = generateYAMLActionLine(actionType, parameters, action);
  yaml += `    - ${actionLine}`;
  
  return yaml;
}

/**
 * Generate a single YAML action line for flow structure
 */
function generateYAMLActionLine(
  actionType: string,
  parameters: Record<string, any>,
  action?: DeviceAction,
): string {
  // For aiAction, use the prompt directly
  if (actionType === 'aiAction' && parameters.prompt) {
    return `aiAction: ${JSON.stringify(parameters.prompt)}`;
  }
  
  // Handle other action types
  const methodName = action?.interfaceAlias || action?.name || actionType;
  
  if (Object.keys(parameters).length === 0) {
    return `${methodName}: null`;
  }
  
  // Single parameter (most common case)
  if (Object.keys(parameters).length === 1) {
    const [key, value] = Object.entries(parameters)[0];
    if (key === 'prompt' || key === 'locate' || key === 'query') {
      return `${methodName}: ${JSON.stringify(value)}`;
    }
  }
  
  // Multiple parameters - use object notation
  const paramStr = JSON.stringify(parameters);
  return `${methodName}: ${paramStr}`;
}

/**
 * Generate YAML structure based on DeviceAction definition
 */
function generateYAMLFromAction(
  action: DeviceAction,
  parameters: Record<string, any>,
): string {
  const actionName = action.interfaceAlias || action.name;

  // Handle different parameter patterns
  if (Object.keys(parameters).length === 0) {
    return `  ${actionName}: null`;
  }

  // Single parameter (common for simple actions)
  if (Object.keys(parameters).length === 1) {
    const [key, value] = Object.entries(parameters)[0];
    if (key === 'prompt' || key === 'locate' || key === 'query') {
      return `  ${actionName}: ${JSON.stringify(value)}`;
    }
  }

  // Multiple parameters - use nested YAML structure
  let yaml = `  ${actionName}:\n`;
  Object.entries(parameters).forEach(([key, value]) => {
    yaml += `    ${key}: ${JSON.stringify(value)}\n`;
  });
  return yaml.trimEnd();
}

/**
 * Legacy YAML generation for backwards compatibility
 */
function generateLegacyYAMLCall(
  actionType: string,
  cleanParameters: Record<string, any>,
): string {
  // Legacy switch-case logic for backward compatibility
  switch (actionType) {
    case 'aiAction':
      return `  aiAction: ${JSON.stringify(cleanParameters.prompt || '')}`;
    case 'aiQuery':
      return `  aiQuery: ${JSON.stringify(cleanParameters.prompt || '')}`;
    case 'aiAssert':
      return `  aiAssert: ${JSON.stringify(cleanParameters.prompt || '')}`;
    case 'aiTap':
      return `  aiTap: ${JSON.stringify(cleanParameters.prompt || '')}`;
    case 'aiHover':
      return `  aiHover: ${JSON.stringify(cleanParameters.prompt || '')}`;
    case 'aiInput': {
      let yaml = '  aiInput:\n';
      yaml += `    locate: ${JSON.stringify(cleanParameters.prompt || '')}\n`;
      yaml += `    value: ${JSON.stringify(cleanParameters.value || '')}`;
      return yaml;
    }
    case 'aiRightClick':
      return `  aiRightClick: ${JSON.stringify(cleanParameters.prompt || '')}`;
    case 'aiKeyboardPress':
      return `  aiKeyboardPress: ${JSON.stringify(cleanParameters.key || cleanParameters.prompt || '')}`;
    case 'aiScroll': {
      let scrollYaml = '  aiScroll:\n';
      scrollYaml += `    locate: ${JSON.stringify(cleanParameters.prompt || '')}\n`;
      if (cleanParameters.direction) {
        scrollYaml += `    direction: ${cleanParameters.direction}`;
      }
      return scrollYaml;
    }
    case 'aiLocate':
      return `  aiLocate: ${JSON.stringify(cleanParameters.prompt || '')}`;
    case 'aiWaitFor':
      return `  aiWaitFor: ${JSON.stringify(cleanParameters.prompt || '')}`;
    default:
      // Handle custom actions
      if (cleanParameters.prompt) {
        return `  ${actionType}: ${JSON.stringify(cleanParameters.prompt)}`;
      } else if (Object.keys(cleanParameters).length > 0) {
        let yamlResult = `  ${actionType}:\n`;
        Object.entries(cleanParameters).forEach(([key, value]) => {
          yamlResult += `    ${key}: ${JSON.stringify(value)}\n`;
        });
        return yamlResult.trimEnd();
      } else {
        // Fallback for actions without parameters
        return `  ${actionType}: null`;
      }
  }
}

/**
 * Generate both JavaScript and YAML code
 */
export function generateCode(
  actionType: string,
  parameters: Record<string, any>,
  options: Partial<CodeGenerationOptions> = {},
): GeneratedCode {
  const jsOptions = { ...options, language: 'javascript' as const };
  const yamlOptions = { ...options, language: 'yaml' as const };

  return {
    javascript: generateJavaScriptCode(actionType, parameters, jsOptions),
    yaml: generateYAMLCode(actionType, parameters, yamlOptions),
  };
}

/**
 * Decompose aiAction into step-by-step workflow
 * This is a placeholder implementation - in real scenarios, this would analyze
 * the action result and extract the actual steps performed
 */
export function decomposeAIAction(
  prompt: string,
  result?: any,
): AIActionDecomposition {
  // This is a simplified implementation
  // In practice, you would analyze the action result/dump to extract actual steps

  // For now, create a basic decomposition based on common patterns
  const steps = [];

  // Analyze prompt for common patterns
  if (
    prompt.toLowerCase().includes('click') ||
    prompt.toLowerCase().includes('tap')
  ) {
    steps.push({
      action: 'aiTap',
      description: `Click on element: ${prompt}`,
      parameters: { prompt },
    });
  } else if (
    prompt.toLowerCase().includes('input') ||
    prompt.toLowerCase().includes('type')
  ) {
    steps.push({
      action: 'aiInput',
      description: `Input text based on: ${prompt}`,
      parameters: { prompt },
    });
  } else if (prompt.toLowerCase().includes('scroll')) {
    steps.push({
      action: 'aiScroll',
      description: `Scroll based on: ${prompt}`,
      parameters: { prompt },
    });
  } else if (prompt.toLowerCase().includes('wait')) {
    steps.push({
      action: 'aiWaitFor',
      description: `Wait for condition: ${prompt}`,
      parameters: { prompt },
    });
  } else {
    // Generic decomposition - most AI actions involve locating then interacting
    steps.push({
      action: 'aiLocate',
      description: `Locate element for: ${prompt}`,
      parameters: { prompt },
    });

    steps.push({
      action: 'aiTap',
      description: `Interact with element: ${prompt}`,
      parameters: { prompt },
    });
  }

  return { steps };
}

/**
 * Generate code for decomposed AI action steps
 */
export function generateDecomposedCode(
  decomposition: AIActionDecomposition,
  options: Partial<CodeGenerationOptions> = {},
): GeneratedCode {
  const { includeComments = true, includeImports = true } = options;

  let jsCode = '';
  let yamlCode = '';

  // JavaScript code
  if (includeImports) {
    jsCode += "import { page } from '@midscene/web-integration';\n\n";
  }

  if (includeComments) {
    jsCode += '// Decomposed AI Action Steps\n';
  }

  decomposition.steps.forEach((step, index) => {
    if (includeComments) {
      jsCode += `\n// Step ${index + 1}: ${step.description}\n`;
    }
    jsCode += generateJavaScriptCode(step.action, step.parameters || {}, {
      language: 'javascript',
      includeComments: false,
      includeImports: false,
    });
    jsCode += '\n';
  });

  // YAML code
  if (includeComments) {
    yamlCode += '# Decomposed AI Action Steps\n';
  }

  decomposition.steps.forEach((step, index) => {
    if (includeComments) {
      yamlCode += `\n# Step ${index + 1}: ${step.description}\n`;
    }
    yamlCode += generateYAMLCode(step.action, step.parameters || {}, {
      language: 'yaml',
      includeComments: false,
    });
    yamlCode += '\n';
  });

  return {
    javascript: jsCode.trim(),
    yaml: yamlCode.trim(),
  };
}

/**
 * Generate code using actionSpace for dynamic action detection
 */
export function generateCodeFromActionSpace(
  actionType: string,
  parameters: Record<string, any>,
  actionSpace: DeviceAction[],
  options: Partial<CodeGenerationOptions> = {},
): GeneratedCode {
  const optionsWithActionSpace = {
    ...options,
    actionSpace,
    includeComments: options.includeComments ?? true,
    includeImports: options.includeImports ?? true,
  };

  return {
    javascript: generateJavaScriptCode(actionType, parameters, {
      ...optionsWithActionSpace,
      language: 'javascript',
    }),
    yaml: generateYAMLCode(actionType, parameters, {
      ...optionsWithActionSpace,
      language: 'yaml',
    }),
  };
}

/**
 * Interface for progress step from infoList
 */
export interface ProgressStep {
  action: string;
  description?: string;
  params?: Record<string, any>;
  originalAction?: string;
}

/**
 * Parse progress steps from infoList items
 */
export function parseProgressStepsFromInfoList(
  infoList: Array<{
    type: string;
    content: string;
    result?: { error?: string | null } | null;
  }>,
): ProgressStep[] {
  const progressSteps: ProgressStep[] = [];

  for (const item of infoList) {
    if (item.type === 'progress' && !item.result?.error) {
      const parts = item.content.split(' - ');
      const action = parts[0]?.trim();
      const description = parts.slice(1).join(' - ').trim();

      // Process Action and Insight types, skip only Planning
      if (action && !action.toLowerCase().includes('planning')) {
        // Try to extract parameters from description
        const params = extractParametersFromDescription(action, description);

        progressSteps.push({
          action: mapProgressActionToApiCall(action),
          description,
          params,
          originalAction: action, // Keep original action type for filtering
        });
      }
    }
  }

  return progressSteps;
}

/**
 * Map progress action names to API calls
 */
function mapProgressActionToApiCall(progressAction: string): string {
  // Handle different formats of Action and Insight progress names
  const actionMap: Record<string, string> = {
    // Action types
    'Action / Tap': 'aiTap',
    'Action / Input': 'aiInput',
    'Action / Scroll': 'aiScroll',
    'Action / Hover': 'aiHover',
    'Action / KeyboardPress': 'aiKeyboardPress',
    'Action / RightClick': 'aiRightClick',
    'Action / DragAndDrop': 'aiDragAndDrop',
    'Action / DoubleClick': 'aiDoubleClick',
    // Insight types
    'Insight / Locate': 'aiLocate',
    'Insight / Query': 'aiQuery',
    'Insight / Assert': 'aiAssert',
    'Insight / Boolean': 'aiQuery',
    'Insight / Number': 'aiQuery',
    'Insight / String': 'aiQuery',
  };

  // Try exact match first
  if (actionMap[progressAction]) {
    return actionMap[progressAction];
  }

  // Try partial matching
  for (const [key, value] of Object.entries(actionMap)) {
    if (progressAction.includes(key) || key.includes(progressAction)) {
      return value;
    }
  }

  // Fallback: convert to camelCase and prefix with 'ai'
  const camelCase = progressAction
    .split(/[\s\/]+/)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');

  return camelCase.startsWith('ai')
    ? camelCase
    : `ai${camelCase.charAt(0).toUpperCase()}${camelCase.slice(1)}`;
}

/**
 * Extract parameters from progress action and description
 */
function extractParametersFromDescription(
  action: string,
  description: string,
): Record<string, any> {
  const params: Record<string, any> = {};

  if (!description) return params;

  // Get action category and type from the action string
  // (e.g., "Action / Tap" -> category: "action", type: "tap")
  const parts = action.split(' / ');
  const category = parts[0]?.trim().toLowerCase();
  const actionType = parts[1]?.trim().toLowerCase();

  if (category === 'action') {
    switch (actionType) {
      case 'tap':
      case 'click':
        // For tap/click actions, the description usually contains the target element
        params.locate = description.trim();
        break;

      case 'input': {
        // For input actions, the description is the value to input
        // The locate parameter should come from previous Insight/Locate step context
        params.value = description.trim();
        break;
      }

      case 'scroll': {
        // For scroll actions, extract direction and target
        // Pattern: "direction" or "direction - target_element"
        const scrollMatch = description.match(/(up|down|left|right)/i);
        if (scrollMatch) {
          params.direction = scrollMatch[1].toLowerCase();
        }

        // If there's more description after direction, use it as locate
        const afterDirection = description
          .replace(/(up|down|left|right)\s*-?\s*/i, '')
          .trim();
        if (afterDirection) {
          params.locate = afterDirection;
        }
        break;
      }

      case 'hover':
        // For hover actions, the description contains the target element
        params.locate = description.trim();
        break;

      case 'keyboardpress': {
        // For keyboard actions, extract the key and optional target
        // Pattern: "key" or "key - target_element"
        if (description.includes(' - ')) {
          const parts = description.split(' - ');
          params.key = parts[0]?.trim();
          params.locate = parts[1]?.trim();
        } else {
          params.key = description.trim();
        }
        break;
      }

      case 'rightclick':
        // For right click actions, the description contains the target element
        params.locate = description.trim();
        break;

      case 'draganddrop': {
        // For drag and drop actions, extract source and target
        // Pattern: "source - target" or just use description
        if (description.includes(' - ')) {
          const parts = description.split(' - ');
          params.from = parts[0]?.trim();
          params.to = parts[1]?.trim();
        } else {
          params.locate = description.trim();
        }
        break;
      }

      case 'doubleclick':
        // For double click actions, the description contains the target element
        params.locate = description.trim();
        break;

      default:
        // For unknown action types, use description as locate parameter
        params.locate = description.trim();
        break;
    }
  } else if (category === 'insight') {
    switch (actionType) {
      case 'locate':
        // For locate actions, the description contains the target to locate
        params.locate = description.trim();
        break;

      case 'query':
      case 'boolean':
      case 'number':
      case 'string':
        // For query actions, the description contains the query/data demand
        params.query = description.trim();
        break;

      case 'assert':
        // For assert actions, the description contains the assertion
        params.assertion = description.trim();
        break;

      default:
        // For unknown insight types, use description as query parameter
        params.query = description.trim();
        break;
    }
  } else {
    // For unknown categories, use description as locate parameter
    params.locate = description.trim();
  }

  return params;
}

/**
 * Generate code from progress steps extracted from infoList
 */
export function generateCodeFromProgressSteps(
  progressSteps: ProgressStep[],
  actionSpace?: DeviceAction[],
  options: Partial<CodeGenerationOptions> = {},
): GeneratedCode {
  const { includeComments = true, includeImports = true } = options;

  let jsCode = '';
  let yamlCode = '';

  // JavaScript code
  if (includeImports) {
    jsCode += "import { page } from '@midscene/web-integration';\n\n";
  }

  if (includeComments) {
    jsCode += '// Generated from actual execution steps\n\n';
  }

  // YAML code
  if (includeComments) {
    yamlCode += '# Generated from actual execution steps\n\n';
  }

  // Process steps and merge Insight/Locate with following Actions
  const enrichedSteps = enrichActionStepsWithLocateInfo(progressSteps);

  // Filter to only include Action steps for code generation
  const actionOnlySteps = enrichedSteps.filter((step) =>
    step.originalAction?.startsWith('Action /'),
  );

  actionOnlySteps.forEach((step, index) => {
    const jsStep = generateJavaScriptCode(step.action, step.params || {}, {
      ...options,
      actionSpace,
      language: 'javascript',
      includeComments: false,
      includeImports: false,
    });
    jsCode += `${jsStep}\n`;

    const yamlStep = generateYAMLCode(step.action, step.params || {}, {
      ...options,
      actionSpace,
      language: 'yaml',
      includeComments: false,
    });
    yamlCode += `${yamlStep}\n`;
  });

  return {
    javascript: jsCode.trim(),
    yaml: yamlCode.trim(),
  };
}

/**
 * Enrich Action steps with locate information from preceding Insight/Locate steps
 */
function enrichActionStepsWithLocateInfo(
  progressSteps: ProgressStep[],
): ProgressStep[] {
  const enrichedSteps: ProgressStep[] = [];
  let lastLocateTarget: string | undefined;

  for (const step of progressSteps) {
    if (step.originalAction?.startsWith('Insight / Locate')) {
      // Store the locate target for the next Action step
      lastLocateTarget = step.params?.locate;
      // Don't add Insight steps to the enriched list
    } else if (step.originalAction?.startsWith('Action /')) {
      // For Action steps, merge with previous locate info if available
      const enrichedParams = { ...step.params };

      // Add locate info for actions that need it
      if (lastLocateTarget && !enrichedParams.locate) {
        if (step.action === 'aiInput') {
          enrichedParams.locate = lastLocateTarget;
        } else if (
          ['aiTap', 'aiHover', 'aiRightClick', 'aiDoubleClick'].includes(
            step.action,
          )
        ) {
          enrichedParams.locate = lastLocateTarget;
        }
      }

      enrichedSteps.push({
        ...step,
        params: enrichedParams,
      });

      // Clear the locate target after using it
      lastLocateTarget = undefined;
    } else {
      // For other step types, add as-is
      enrichedSteps.push(step);
    }
  }

  return enrichedSteps;
}

/**
 * Get available actions from actionSpace with their parameter schemas
 */
export function getAvailableActions(actionSpace: DeviceAction[]): Array<{
  name: string;
  interfaceAlias?: string;
  description?: string;
  parameters: Record<
    string,
    {
      required: boolean;
      description?: string;
    }
  >;
}> {
  return actionSpace.map((action) => {
    const parameters = extractParametersFromSchema(action.paramSchema);
    const paramInfo: Record<
      string,
      { required: boolean; description?: string }
    > = {};

    for (const [key, info] of Object.entries(parameters)) {
      paramInfo[key] = {
        required: (info as any).required,
        description: (info as any).field?.description,
      };
    }

    return {
      name: action.name,
      interfaceAlias: action.interfaceAlias,
      description: action.description,
      parameters: paramInfo,
    };
  });
}
