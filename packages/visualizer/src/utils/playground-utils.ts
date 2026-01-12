import type { WebUIContext } from '@midscene/core';
import { StaticPage, StaticPageAgent } from '@midscene/web/static';
import type { ZodObjectSchema } from '../types';
import { isZodObjectSchema, unwrapZodType } from '../types';

/**
 * Type guard to check if a value is a ScreenshotItem-like object (runtime format with base64 property).
 * This is different from ScreenshotItem.isSerialized() which checks for { $screenshot: string } format.
 */
export function isScreenshotItem(
  value: unknown,
): value is { base64: string; id?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'base64' in value &&
    typeof (value as { base64: unknown }).base64 === 'string'
  );
}

/**
 * Helper to get screenshot base64 from context.
 * After restoration, screenshot is a base64 string (restored from { $screenshot: id }).
 * TypeScript thinks it's ScreenshotItem, so we need type assertion.
 */
function getScreenshotBase64(context: WebUIContext): string {
  const screenshot = context.screenshot;
  // After JSON parse and restoration, screenshot is a string (base64 data)
  if (typeof screenshot === 'string') {
    return screenshot;
  }
  // If it's still a ScreenshotItem (shouldn't happen in visualizer), get base64
  if (isScreenshotItem(screenshot)) {
    return screenshot.base64;
  }
  return '';
}

// Get action name based on type
export const actionNameForType = (type: string) => {
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
  if (words.length > 3) {
    return words.slice(-3).join(' ');
  }

  return fullName;
};

// Create static agent from context
export const staticAgentFromContext = (context: WebUIContext) => {
  // Convert WebUIContext to StaticUIContext format
  // After restoration, context.screenshot is a base64 string (restored from { $screenshot: id })
  const staticContext = {
    size: context.size,
    screenshotBase64: getScreenshotBase64(context),
  };
  const page = new StaticPage(staticContext);
  return new StaticPageAgent(page);
};

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

export const isRunButtonEnabled = (
  runButtonEnabled: boolean,
  needsStructuredParams: boolean,
  params: any,
  actionSpace: any[] | undefined,
  selectedType: string,
  promptValue: string,
) => {
  if (!runButtonEnabled) {
    return false;
  }

  // Check if this method needs any input
  const needsAnyInput = (() => {
    if (actionSpace) {
      // Use actionSpace to determine if method needs any input
      const action = actionSpace.find(
        (a) => a.interfaceAlias === selectedType || a.name === selectedType,
      );

      // If action exists in actionSpace, check if it has paramSchema with actual fields
      if (action) {
        if (!action.paramSchema) return false;

        // Check if paramSchema actually has fields
        if (
          typeof action.paramSchema === 'object' &&
          'shape' in action.paramSchema
        ) {
          const shape =
            (action.paramSchema as { shape: Record<string, unknown> }).shape ||
            {};
          const shapeKeys = Object.keys(shape);
          return shapeKeys.length > 0; // Only need input if there are actual fields
        }

        // If paramSchema exists but not in expected format, assume it needs input
        return true;
      }

      // If not found in actionSpace, assume most methods need input
      return true;
    }

    // Fallback: most methods need some input
    return true;
  })();

  // If method doesn't need any input, button is always enabled (when runButtonEnabled is true)
  if (!needsAnyInput) {
    return true;
  }

  if (needsStructuredParams) {
    const currentParams = params || {};
    const action = actionSpace?.find(
      (a) => a.interfaceAlias === selectedType || a.name === selectedType,
    );
    if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
      // Check if all required fields are filled
      const schema = action.paramSchema as unknown as ZodObjectSchema;
      const shape = schema.shape || {};
      return Object.keys(shape).every((key) => {
        const field = shape[key];
        const { isOptional } = unwrapZodType(field);
        const value = currentParams[key];
        // A field is valid if it's optional or has a non-empty value
        return (
          isOptional || (value !== undefined && value !== '' && value !== null)
        );
      });
    }
    return true; // Fallback for safety
  }
  return promptValue.trim().length > 0;
};
