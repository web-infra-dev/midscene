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
  if (type === 'aiDoubleClick') {
    return 'What element do you want to double-click?';
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
