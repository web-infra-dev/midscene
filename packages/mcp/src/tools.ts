import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Define the tools once to avoid repetition
export const TOOLS: Tool[] = [
  {
    name: 'midscene_navigate',
    description:
      'Navigate the current tab to a URL or open a URL in a new tab.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        openNewTab: {
          type: 'boolean',
          description:
            'Optional. If true, open the URL in a new tab. Defaults to false (navigate current tab).',
        },
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
    name: 'midscene_get_tabs',
    description:
      'Get a list of currently open browser tabs, each including its ID, title, and URL.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'midscene_set_active_tab',
    description: 'Set the active tab to the tab with the given ID.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description:
            'ID of the tab to set as active. Obtain the ID from the `midscene_get_tabs` tool.',
        },
      },
      required: ['tabId'],
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
    name: 'midscene_scroll',
    description:
      'Scroll the page or a specific element based on natural language instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        value: {
          type: 'string',
          description:
            "Specify the scroll direction and amount (e.g., 'up', 'down', 'to the bottom', 'to the top', 'down 800px') or describe the element to scroll to in natural language.",
        },
        selector: {
          type: 'string',
          description:
            'Optional. Describe the container element to scroll within using natural language. If omitted, the entire page will be scrolled.',
        },
      },
      required: ['value'],
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
