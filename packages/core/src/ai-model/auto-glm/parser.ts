import { getDebug } from '@midscene/shared/logger';
import type { ParsedAction } from './actions';

const debug = getDebug('auto-glm-parser');

// Do not rely on regex extraction here; regex can fail on malformed input.
// Bad Case: finish(message="Finished! Now There is a contact whose name is \"Tom\" in the list.")
export const extractValueAfter = (src: string, key: string): string => {
  const idx = src.indexOf(key);
  if (idx === -1) {
    throw new Error(`Missing key ${key} in action payload ${src}`);
  }
  let rest = src.slice(idx + key.length).trim();
  if (rest.endsWith('")')) {
    rest = rest.slice(0, -2);
  }
  return rest;
};

export function parseAction(response: {
  think: string;
  content: string;
}): ParsedAction {
  debug('Parsing action:', response);
  let trimmedResponse = '';
  try {
    trimmedResponse = response.content.trim();

    if (
      trimmedResponse.startsWith('do(action="Type"') ||
      trimmedResponse.startsWith('do(action="Type_Name"')
    ) {
      const text = extractValueAfter(trimmedResponse, 'text="');
      return {
        _metadata: 'do',
        action: 'Type',
        text,
        think: response.think,
      } as ParsedAction;
    }

    if (trimmedResponse.startsWith('finish(message=')) {
      let message = extractValueAfter(trimmedResponse, 'finish(message="');
      if (message.endsWith(')')) message = message.slice(0, -1);
      return {
        _metadata: 'finish',
        message,
        think: response.think,
      } as ParsedAction;
    }

    if (trimmedResponse.startsWith('do(')) {
      const actionMatch = trimmedResponse.match(/do\(action="([^"]+)"/);
      if (!actionMatch)
        throw new Error(
          `Failed to extract action type from do() call; raw="${trimmedResponse}"`,
        );
      const actionType = actionMatch[1];

      const baseAction = { _metadata: 'do' as const, think: response.think };
      switch (actionType) {
        case 'Tap': {
          const elementMatch = trimmedResponse.match(/element=\[(\d+),(\d+)\]/);
          if (!elementMatch)
            throw new Error(
              `Failed to extract element coordinates for Tap; raw="${trimmedResponse}"`,
            );
          return {
            ...baseAction,
            action: 'Tap',
            element: [Number(elementMatch[1]), Number(elementMatch[2])],
          } as ParsedAction;
        }
        case 'Double Tap': {
          const elementMatch = trimmedResponse.match(/element=\[(\d+),(\d+)\]/);
          if (!elementMatch)
            throw new Error(
              `Failed to extract element coordinates for Double Tap; raw="${trimmedResponse}"`,
            );
          return {
            ...baseAction,
            action: 'Double Tap',
            element: [Number(elementMatch[1]), Number(elementMatch[2])],
          } as ParsedAction;
        }
        case 'Swipe': {
          const startMatch = trimmedResponse.match(/start=\[(\d+),(\d+)\]/);
          const endMatch = trimmedResponse.match(/end=\[(\d+),(\d+)\]/);
          if (!startMatch || !endMatch)
            throw new Error(
              `Failed to extract start/end coordinates for Swipe; raw="${trimmedResponse}"`,
            );
          return {
            ...baseAction,
            action: 'Swipe',
            start: [Number(startMatch[1]), Number(startMatch[2])],
            end: [Number(endMatch[1]), Number(endMatch[2])],
          } as ParsedAction;
        }
        case 'Long Press': {
          const elementMatch = trimmedResponse.match(/element=\[(\d+),(\d+)\]/);
          if (!elementMatch)
            throw new Error(
              `Failed to extract element coordinates for Long Press; raw="${trimmedResponse}"`,
            );
          return {
            ...baseAction,
            action: 'Long Press',
            element: [Number(elementMatch[1]), Number(elementMatch[2])],
          } as ParsedAction;
        }
        case 'Launch': {
          const app = extractValueAfter(trimmedResponse, 'app="');
          return { ...baseAction, action: 'Launch', app } as ParsedAction;
        }
        case 'Back': {
          return { ...baseAction, action: 'Back' } as ParsedAction;
        }
        case 'Home': {
          return { ...baseAction, action: 'Home' } as ParsedAction;
        }
        case 'Wait': {
          const durationMatch = trimmedResponse.match(
            /duration=(?:["\[])?(\d+)/,
          );
          if (!durationMatch) {
            throw new Error(
              `Failed to extract duration for Wait; raw="${trimmedResponse}"`,
            );
          }
          const seconds = Number.parseInt(durationMatch[1], 10);
          const durationMs = seconds * 1000;
          return {
            ...baseAction,
            action: 'Wait',
            durationMs,
          } as ParsedAction;
        }
        case 'Interact': {
          return { ...baseAction, action: 'Interact' } as ParsedAction;
        }
        case 'Call_API': {
          const instruction = extractValueAfter(
            trimmedResponse,
            'instruction="',
          );
          return {
            ...baseAction,
            action: 'Call_API',
            instruction,
          } as ParsedAction;
        }
        case 'Take_over': {
          const message = extractValueAfter(trimmedResponse, 'message="');
          return {
            ...baseAction,
            action: 'Take_over',
            message,
          } as ParsedAction;
        }
        case 'Note': {
          const message = extractValueAfter(trimmedResponse, 'message="');
          return {
            ...baseAction,
            action: 'Note',
            message,
          } as ParsedAction;
        }
        default:
          throw new Error(
            `Unknown action type: ${actionType}; raw="${trimmedResponse}"`,
          );
      }
    }
    throw new Error(`Failed to parse action: ${trimmedResponse}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse action: ${errorMessage}; raw="${trimmedResponse}"`,
    );
  }
}

export function parseAutoGLMResponse(content: string): {
  think: string;
  content: string;
} {
  if (content.includes('finish(message=')) {
    const parts = content.split('finish(message=');
    const think = parts[0].trim();
    const actionContent = `finish(message=${parts[1]}`;
    return { think, content: actionContent };
  }
  if (content.includes('do(action=')) {
    const parts = content.split('do(action=');
    const think = parts[0].trim();
    const actionContent = `do(action=${parts[1]}`;
    return { think, content: actionContent };
  }
  if (content.includes('<answer>')) {
    const parts = content.split('<answer>');
    const think = parts[0]
      .replace(/<think>/g, '')
      .replace(/<\/think>/g, '')
      .trim();
    const actionContent = parts[1].replace(/<\/answer>/g, '').trim();
    return { think, content: actionContent };
  }
  return { think: '', content };
}

export function parseAutoGLMLocateResponse(rawResponse: string): {
  think: string;
  coordinates: { x: number; y: number } | null;
  error?: string;
} {
  const { think, content: actionContent } = parseAutoGLMResponse(rawResponse);
  if (!actionContent.startsWith('do(action="Tap"')) {
    return {
      think,
      coordinates: null,
      error: `Unexpected action type in auto-glm locate response: ${actionContent}`,
    };
  }
  try {
    const elementMatch = actionContent.match(/element=\[(\d+),(\d+)\]/);
    if (!elementMatch) {
      return {
        think,
        coordinates: null,
        error: `Failed to extract element coordinates from auto-glm response: ${actionContent}`,
      };
    }
    const x = Number(elementMatch[1]);
    const y = Number(elementMatch[2]);
    return { think, coordinates: { x, y } };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      think,
      coordinates: null,
      error: `Failed to parse coordinates "${actionContent}" with errorMessage: ${errorMessage}`,
    };
  }
}
