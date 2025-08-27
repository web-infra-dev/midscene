import type { UIContext } from '@midscene/core';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import type { WebUIContext } from '@midscene/web';
import { StaticPage, StaticPageAgent } from '@midscene/web/playground';
import type { ZodObjectSchema } from './types';
import { isZodObjectSchema, unwrapZodType } from './types';

// Server base URL
export const serverBase = `http://localhost:${PLAYGROUND_SERVER_PORT}`;

// Check server status
export const checkServerStatus = async () => {
  try {
    const res = await fetch(`${serverBase}/status`);
    return res.status === 200;
  } catch (e) {
    return false;
  }
};

// Send request to server
export const requestPlaygroundServer = async (
  context: UIContext | string,
  type: string,
  prompt: string,
  {
    requestId,
    deepThink,
    params,
    screenshotIncluded,
    domIncluded,
  }: {
    requestId?: string;
    deepThink?: boolean;
    params?: any;
    screenshotIncluded?: boolean;
    domIncluded?: boolean | 'visible-only';
  } = {},
) => {
  const payload: any = { context, type, prompt };

  // If requestId is provided, add it to the request
  if (requestId) {
    payload.requestId = requestId;
  }

  if (deepThink) {
    payload.deepThink = deepThink;
  }

  if (screenshotIncluded !== undefined) {
    payload.screenshotIncluded = screenshotIncluded;
  }

  if (domIncluded !== undefined) {
    payload.domIncluded = domIncluded;
  }

  // If params is provided, add it to the request for structured parameters
  if (params) {
    payload.params = params;
  }

  const res = await fetch(`${serverBase}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return res.json();
};

// Send configuration to server
export const overrideServerConfig = async (aiConfig: any) => {
  return fetch(`${serverBase}/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ aiConfig }),
  });
};

// Cancel task
export const cancelTask = async (requestId: string) => {
  try {
    const res = await fetch(`${serverBase}/cancel/${requestId}`);
    return res.json();
  } catch (error) {
    console.error('Failed to cancel task:', error);
    return { error: 'Failed to cancel task' };
  }
};

// Get task progress
export const getTaskProgress = async (requestId: string) => {
  try {
    const response = await fetch(`${serverBase}/task-progress/${requestId}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to poll task progress:', error);
    return { tip: null };
  }
};

// Get action space from server
export const getActionSpace = async (context?: string) => {
  try {
    if (!context) {
      return [];
    }

    const response = await fetch(`${serverBase}/action-space`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ context }),
    });

    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error('Failed to get action space:', error);
    return [];
  }
};

// Get action name based on type
export const actionNameForType = (type: string) => {
  // Remove 'ai' prefix and convert camelCase to space-separated words
  const typeWithoutAi = type.startsWith('ai') ? type.slice(2) : type;

  // Convert camelCase to space-separated words
  return typeWithoutAi.replace(/([A-Z])/g, ' $1').trim();
};

// Create static agent from context
export const staticAgentFromContext = (context: WebUIContext) => {
  const page = new StaticPage(context);
  return new StaticPageAgent(page);
};

// Format error message
export const formatErrorMessage = (e: any): string => {
  const errorMessage = e?.message || '';
  if (errorMessage.includes('of different extension')) {
    return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
  }
  // Always return the actual error message, including NOT_IMPLEMENTED_AS_DESIGNED errors
  return errorMessage || 'Unknown error';
};

// Get placeholder text based on run type
export const getPlaceholderForType = (type: string): string => {
  if (type === 'aiQuery') {
    return 'What do you want to query?';
  }
  if (type === 'aiAssert') {
    return 'What do you want to assert?';
  }
  if (type === 'aiTap') {
    return 'What element do you want to tap?';
  }
  if (type === 'aiHover') {
    return 'What element do you want to hover over?';
  }
  if (type === 'aiInput') {
    return 'Format: <value> | <element>\nExample: hello world | search box';
  }
  if (type === 'aiRightClick') {
    return 'What element do you want to right-click?';
  }
  if (type === 'aiKeyboardPress') {
    return 'Format: <key> | <element (optional)>\nExample: Enter | text field';
  }
  if (type === 'aiScroll') {
    return 'Format: <direction> <amount> | <element (optional)>\nExample: down 500 | main content';
  }
  if (type === 'aiLocate') {
    return 'What element do you want to locate?';
  }
  if (type === 'aiBoolean') {
    return 'What do you want to check (returns true/false)?';
  }
  if (type === 'aiNumber') {
    return 'What number do you want to extract?';
  }
  if (type === 'aiString') {
    return 'What text do you want to extract?';
  }
  if (type === 'aiAsk') {
    return 'What do you want to ask?';
  }
  if (type === 'aiWaitFor') {
    return 'What condition do you want to wait for?';
  }
  return 'What do you want to do?';
};

// Blank result template
export const blankResult = {
  result: null,
  dump: null,
  reportHTML: null,
  error: null,
};

export const isRunButtonEnabled = (
  runButtonEnabled: boolean,
  needsStructuredParams: boolean,
  params: any,
  actionSpace: any[] | undefined,
  selectedType: string,
  promptValue: string,
) => {
  if (!runButtonEnabled) {
    return false;
  }
  if (needsStructuredParams) {
    const currentParams = params || {};
    const action = actionSpace?.find(
      (a) => a.interfaceAlias === selectedType || a.name === selectedType,
    );
    if (action?.paramSchema && isZodObjectSchema(action.paramSchema as any)) {
      // Check if all required fields are filled
      const schema = action.paramSchema as unknown as ZodObjectSchema;
      const shape = schema.shape || {};
      return Object.keys(shape).every((key) => {
        const field = shape[key];
        const { isOptional } = unwrapZodType(field);
        const value = currentParams[key];
        // A field is valid if it's optional or has a non-empty value
        return (
          isOptional || (value !== undefined && value !== '' && value !== null)
        );
      });
    }
    return true; // Fallback for safety
  }
  return promptValue.trim().length > 0;
};
