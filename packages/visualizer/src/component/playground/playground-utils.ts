import type { UIContext } from '@midscene/core';
import {
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
  StaticPage,
  StaticPageAgent,
} from '@midscene/web/playground';
import type { WebUIContext } from '@midscene/web/utils';

// Server base URL
export const serverBase = 'http://localhost:5800';

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
  context: UIContext,
  type: string,
  prompt: string,
) => {
  const res = await fetch(`${serverBase}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context, type, prompt }),
  });
  return res.json();
};

// Get action name based on type
export const actionNameForType = (type: string) => {
  if (type === 'aiAction') return 'Action';
  if (type === 'aiQuery') return 'Query';
  if (type === 'aiAssert') return 'Assert';
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
