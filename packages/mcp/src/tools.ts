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
      },
      required: ['name'],
    },
  },
  {
    name: 'midscene_achieve_goal',
    description:
      'Automatically achieve a goal using natural language instructions',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Describe your target goal in natural language',
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'midscene_click',
    description:
      'Describe the element to click using natural language for automatic clicking.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description:
            'Describe in natural language the position of the element to be clicked',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'midscene_input',
    description:
      'Describe the input field using natural language to automatically fill it with the provided value.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description:
            'Describe the element to be filled using natural language',
        },
        value: { type: 'string', description: 'The value to be entered' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'midscene_hover',
    description:
      'Describe the element using natural language to automatically hover over it.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description:
            'Describe in natural language the position of the element to be hovered',
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
