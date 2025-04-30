export const tools = {
  midscene_playwright_example: {
    name: 'midscene_playwright_example',
    description:
      'Provides Playwright code examples for Midscene. If users need to generate Midscene test cases, they can call this method to get sample Midscene Playwright test cases for generating end-user test cases. Each step must first be verified using the mcp method, and then the final test case is generated based on the playwright example according to the steps executed by mcp',
  },
  midscene_navigate: {
    name: 'midscene_navigate',
    description:
      'Navigates the browser to the specified URL. Always opens in the current tab.',
  },
  midscene_get_tabs: {
    name: 'midscene_get_tabs',
    description:
      'Retrieves a list of all open browser tabs, including their ID, title, and URL.',
  },
  midscene_set_active_tab: {
    name: 'midscene_set_active_tab',
    description:
      "Switches the browser's focus to the tab specified by its ID. Use midscene_get_tabs first to find the correct tab ID.",
  },
  midscene_aiWaitFor: {
    name: 'midscene_aiWaitFor',
    description:
      'Waits until a specified condition, described in natural language, becomes true on the page. Polls the condition using AI.',
  },
  midscene_aiAssert: {
    name: 'midscene_aiAssert',
    description:
      'Asserts that a specified condition, described in natural language, is true on the page. Polls the condition using AI.',
  },
  midscene_aiKeyboardPress: {
    name: 'midscene_aiKeyboardPress',
    description: 'Presses a specific key on the keyboard.',
  },
  midscene_screenshot: {
    name: 'midscene_screenshot',
    description:
      'Captures a screenshot of the currently active browser tab and saves it with the given name.',
  },
  midscene_aiTap: {
    name: 'midscene_aiTap',
    description:
      'Locates and clicks an element on the current page based on a natural language description (selector).',
  },
  midscene_aiScroll: {
    name: 'midscene_aiScroll',
    description:
      'Scrolls the page or a specified element. Can scroll by a fixed amount or until an edge is reached.',
  },
  midscene_aiInput: {
    name: 'midscene_aiInput',
    description:
      'Inputs text into a specified form field or element identified by a natural language selector.',
  },
  midscene_aiHover: {
    name: 'midscene_aiHover',
    description:
      'Moves the mouse cursor to hover over an element identified by a natural language selector.',
  },
};
