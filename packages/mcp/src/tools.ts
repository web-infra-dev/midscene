export const tools = {
  // Web-specific tools
  midscene_aiHover: {
    name: 'midscene_aiHover',
    description:
      'Moves the mouse cursor to hover over an element identified by a natural language selector.',
  },

  // Common tools
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
  midscene_screenshot: {
    name: 'midscene_screenshot',
    description:
      'Captures a screenshot of the currently active browser tab and saves it with the given name.',
  },
  // midscene_aiKeyboardPress: {
  //   name: 'midscene_aiKeyboardPress',
  //   description: 'Presses a specific key on the keyboard.',
  // },
  // midscene_aiTap: {
  //   name: 'midscene_aiTap',
  //   description:
  //     'Locates and clicks an element on the current page based on a natural language description (selector).',
  // },
  // midscene_aiScroll: {
  //   name: 'midscene_aiScroll',
  //   description:
  //     'Scrolls the page or a specified element. Can scroll by a fixed amount or until an edge is reached.',
  // },
  // midscene_aiInput: {
  //   name: 'midscene_aiInput',
  //   description:
  //     'Inputs text into a specified form field or element identified by a natural language selector.',
  // },

  // Android-specific tools
  midscene_android_connect: {
    name: 'midscene_android_connect',
    description: 'Connect to an Android device via ADB for automation',
  },
  midscene_android_launch: {
    name: 'midscene_android_launch',
    description: 'Launch an application or navigate to URL on Android device',
  },
  midscene_android_list_devices: {
    name: 'midscene_android_list_devices',
    description: 'List all connected Android devices available for automation',
  },
  midscene_android_back: {
    name: 'midscene_android_back',
    description: 'Press the back button on Android device',
  },
  midscene_android_home: {
    name: 'midscene_android_home',
    description: 'Press the home button on Android device',
  },
};
