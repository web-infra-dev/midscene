import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Define the tools once to avoid repetition
export const TOOLS: Tool[] = [
  {
    name: 'midscene_navigate',
    description: 'Navigate to a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        launchOptions: {
          type: 'object',
          description:
            "PuppeteerJS LaunchOptions. Default null. If changed and not null, browser restarts. Example: { headless: true, args: ['--no-sandbox'] }",
        },
        allowDangerous: {
          type: 'boolean',
          description:
            'Allow dangerous LaunchOptions that reduce security. When false, dangerous args like --no-sandbox will throw errors. Default false.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'midscene_screenshot',
    description: 'Take a screenshot of the current page or a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the screenshot' },
        selector: {
          type: 'string',
          description: 'CSS selector for element to screenshot',
        },
        width: {
          type: 'number',
          description: 'Width in pixels (default: 800)',
        },
        height: {
          type: 'number',
          description: 'Height in pixels (default: 600)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'midscene_click',
    description: 'Click an element on the page',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for element to click',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'midscene_fill',
    description: 'Fill out an input field',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for input field',
        },
        value: { type: 'string', description: 'Value to fill' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'midscene_select',
    description: 'Select an element on the page with Select tag',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for element to select',
        },
        value: { type: 'string', description: 'Value to select' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'midscene_hover',
    description: 'Hover an element on the page',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for element to hover',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'midscene_evaluate',
    description: 'Execute JavaScript in the browser console',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript code to execute' },
      },
      required: ['script'],
    },
  },
];
