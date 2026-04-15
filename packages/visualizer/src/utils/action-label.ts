export const actionNameForType = (type: string) => {
  if (!type) return '';
  // Remove 'ai' prefix and convert camelCase to space-separated words
  const typeWithoutAi = type.startsWith('ai') ? type.slice(2) : type;

  // Special handling for iOS-specific actions to preserve their full names
  if (typeWithoutAi.startsWith('IOS')) {
    // For IOS actions, keep IOS as a unit and add spaces before remaining capital letters
    return typeWithoutAi
      .substring(3)
      .replace(/([A-Z])/g, ' $1')
      .replace(/^/, 'IOS')
      .trim();
  }

  const fullName = typeWithoutAi.replace(/([A-Z])/g, ' $1').trim();

  // For long names, keep the last 3 words to make them shorter
  const words = fullName.split(' ');
  const result = words.length > 3 ? words.slice(-3).join(' ') : fullName;

  // Capitalize the first letter of each word for consistent display
  return result.replace(/\b\w/g, (c) => c.toUpperCase());
};

export const getPromptInputActionLabel = (
  type: string,
  fallbackLabel?: string,
) => {
  return actionNameForType(type) || fallbackLabel || 'Action';
};
