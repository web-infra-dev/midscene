import type { UIContext } from '@midscene/core';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import {
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
  StaticPage,
  StaticPageAgent,
} from '@midscene/web/playground';
import type { WebUIContext } from '@midscene/web/utils';

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
  }: {
    requestId?: string;
    deepThink?: boolean;
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

// Get action name based on type
export const actionNameForType = (type: string) => {
  if (type === 'aiAction') return 'Action';
  if (type === 'aiQuery') return 'Query';
  if (type === 'aiAssert') return 'Assert';
  if (type === 'aiTap') return 'Tap';
  return type;
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
  if (!errorMessage?.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)) {
    return errorMessage;
  }
  return 'Unknown error';
};

// Get placeholder text based on run type
export const getPlaceholderForType = (type: string): string => {
  if (type === 'aiQuery') {
    return 'What do you want to query?';
  }
  if (type === 'aiAssert') {
    return 'What do you want to assert?';
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
