export const tools = {
  // Common tools
  wait_for: {
    name: 'wait_for',
    description:
      'Waits until a specified condition, described in natural language, becomes true on the page. Polls the condition using AI.',
  },
  assert: {
    name: 'assert',
    description:
      'Asserts that a specified condition, described in natural language, is true on the page. Polls the condition using AI.',
  },
  take_screenshot: {
    name: 'take_screenshot',
    description:
      'Captures a screenshot of the currently active browser tab and saves it with the given name.',
  },
  // Android-specific tools
  midscene_android_connect: {
    name: 'midscene_android_connect',
    description: 'Connect to an Android device via ADB for automation',
  },
  midscene_android_list_devices: {
    name: 'midscene_android_list_devices',
    description: 'List all connected Android devices available for automation',
  },
};
