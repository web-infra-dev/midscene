import {
  type BackAction,
  type DoubleTapAction,
  type FinishAction,
  type HomeAction,
  type LaunchAction,
  type LongPressAction,
  type ParsedAction,
  type SwipeAction,
  type TapAction,
  type TypeAction,
  type WaitAction,
  transformAutoGLMAction,
} from '@/ai-model/auto-glm/actions';
import {
  extractValueAfter,
  parseAction,
  parseAutoGLMLocateResponse,
  parseAutoGLMResponse,
} from '@/ai-model/auto-glm/parser';
import { isAutoGLM } from '@/ai-model/auto-glm/util';
import { describe, expect, it } from 'vitest';

const defaultSize = { width: 1080, height: 1920 };

describe('auto-glm parser', () => {
  describe('extractValueAfter', () => {
    it('should extract value after key', () => {
      const result = extractValueAfter('text="Hello"', 'text="');
      expect(result).toBe('Hello"');
    });

    it('should handle value ending with quote and parenthesis', () => {
      const result = extractValueAfter('message="Task done")end', 'message="');
      expect(result).toBe('Task done")end');
    });

    it('should trim whitespace', () => {
      const result = extractValueAfter('  value="test"  ', 'value="');
      expect(result).toBe('test"');
    });

    it('should handle escaped quotes in value', () => {
      const result = extractValueAfter(
        'message="Finished! Now There is a contact whose name is "Tom" in the list.")',
        'message="',
      );
      expect(result).toBe(
        'Finished! Now There is a contact whose name is "Tom" in the list.',
      );
    });

    it('should throw error when key is not found', () => {
      expect(() => {
        extractValueAfter('some content', 'notfound="');
      }).toThrow('Missing key notfound="');
    });

    it('should handle app name extraction', () => {
      const result = extractValueAfter(
        'do(action="Launch", app="Camera")',
        'app="',
      );
      expect(result).toBe('Camera');
    });

    it('should handle instruction extraction', () => {
      const result = extractValueAfter(
        'instruction="call some API")',
        'instruction="',
      );
      expect(result).toBe('call some API');
    });
  });

  describe('parseAutoGLMResponse', () => {
    it('should parse response with think and do action', () => {
      const response = 'I see a button. do(action="Tap", element=[100,200])';
      const result = parseAutoGLMResponse(response);
      expect(result.think).toBe('I see a button.');
      expect(result.content).toBe('do(action="Tap", element=[100,200])');
    });

    it('should parse response with think and finish action', () => {
      const response = 'Task completed. finish(message="Done successfully")';
      const result = parseAutoGLMResponse(response);
      expect(result.think).toBe('Task completed.');
      expect(result.content).toContain('finish(message="Done successfully")');
    });

    it('should parse response with answer tags', () => {
      const response =
        '<think>Click the button</think>\n<answer>foo(action="Tap", element=[50,100])</answer>';
      const result = parseAutoGLMResponse(response);
      expect(result.think).toBe('Click the button');
      expect(result.content).toBe('foo(action="Tap", element=[50,100])');
    });
  });

  describe('parseAction', () => {
    it('should parse Tap action', () => {
      const action = parseAction({
        think: 'Need to click button',
        content: 'do(action="Tap", element=[100,200])',
      });
      expect(action._metadata).toBe('do');
      const tapAction = action as TapAction;
      expect(tapAction.action).toBe('Tap');
      expect(tapAction.element).toEqual([100, 200]);
    });

    it('should parse Double Tap action', () => {
      const action = parseAction({
        think: 'Double click to zoom',
        content: 'do(action="Double Tap", element=[300,400])',
      });
      const doubleTapAction = action as DoubleTapAction;
      expect(doubleTapAction.action).toBe('Double Tap');
      expect(doubleTapAction.element).toEqual([300, 400]);
    });

    it('should parse Type action', () => {
      const action = parseAction({
        think: 'Enter text',
        content: 'do(action="Type", text="Hello")',
      });
      const typeAction = action as TypeAction;
      expect(typeAction.action).toBe('Type');
      expect(typeAction.text).toBe('Hello');
    });

    it('should parse Swipe action', () => {
      const action = parseAction({
        think: 'Swipe left',
        content: 'do(action="Swipe", start=[800,500], end=[200,500])',
      });
      const swipeAction = action as SwipeAction;
      expect(swipeAction.action).toBe('Swipe');
      expect(swipeAction.start).toEqual([800, 500]);
      expect(swipeAction.end).toEqual([200, 500]);
    });

    it('should parse Long Press action', () => {
      const action = parseAction({
        think: 'Long press icon',
        content: 'do(action="Long Press", element=[150,250])',
      });
      const longPressAction = action as LongPressAction;
      expect(longPressAction.action).toBe('Long Press');
      expect(longPressAction.element).toEqual([150, 250]);
    });

    it('should parse Launch action', () => {
      const action = parseAction({
        think: 'Launch app',
        content: 'do(action="Launch", app="Camera")',
      });
      const launchAction = action as LaunchAction;
      expect(launchAction.action).toBe('Launch');
      expect(launchAction.app).toBe('Camera');
    });

    it('should parse Back action', () => {
      const action = parseAction({
        think: 'Go back',
        content: 'do(action="Back")',
      });
      const backAction = action as BackAction;
      expect(backAction.action).toBe('Back');
    });

    it('should parse Home action', () => {
      const action = parseAction({
        think: 'Return home',
        content: 'do(action="Home")',
      });
      const homeAction = action as HomeAction;
      expect(homeAction.action).toBe('Home');
    });

    it('should parse Wait action', () => {
      const action = parseAction({
        think: 'Wait for loading',
        content: 'do(action="Wait", duration="3")',
      });
      const waitAction = action as WaitAction;
      expect(waitAction.action).toBe('Wait');
      expect(waitAction.durationMs).toBe(3000);
    });

    it('should parse Finish action', () => {
      const action = parseAction({
        think: 'All done',
        content: 'finish(message="Task completed")',
      });
      const finishAction = action as FinishAction;
      expect(finishAction._metadata).toBe('finish');
      expect(finishAction.message).toBe('Task completed');
    });

    it('should parse Interact action', () => {
      const action = parseAction({
        think: 'Need interaction',
        content: 'do(action="Interact")',
      });
      expect(action._metadata).toBe('do');
      expect((action as any).action).toBe('Interact');
    });

    it('should parse Call_API action', () => {
      const action = parseAction({
        think: 'Call external API',
        content: 'do(action="Call_API", instruction="Get weather data")',
      });
      expect(action._metadata).toBe('do');
      expect((action as any).action).toBe('Call_API');
      expect((action as any).instruction).toBe('Get weather data');
    });

    it('should parse Take_over action', () => {
      const action = parseAction({
        think: 'Manual intervention needed',
        content:
          'do(action="Take_over", message="Please handle this manually")',
      });
      expect(action._metadata).toBe('do');
      expect((action as any).action).toBe('Take_over');
      expect((action as any).message).toBe('Please handle this manually');
    });

    it('should parse Note action', () => {
      const action = parseAction({
        think: 'Make a note',
        content: 'do(action="Note", message="Remember this step")',
      });
      expect(action._metadata).toBe('do');
      expect((action as any).action).toBe('Note');
      expect((action as any).message).toBe('Remember this step');
    });

    it('should throw error for unknown action type', () => {
      expect(() => {
        parseAction({
          think: 'Unknown',
          content: 'do(action="UnknownAction")',
        });
      }).toThrow('Unknown action type: UnknownAction');
    });

    it('should throw error for malformed do() call', () => {
      expect(() => {
        parseAction({
          think: 'Malformed',
          content: 'do(invalid syntax)',
        });
      }).toThrow('Failed to extract action type from do() call');
    });
  });

  describe('parseAutoGLMLocateResponse', () => {
    it('should parse locate response with coordinates', () => {
      const response = '<answer>do(action="Tap", element=[500,750])</answer>';
      const result = parseAutoGLMLocateResponse(response);
      expect(result.coordinates).toEqual({ x: 500, y: 750 });
    });

    it('should return error for non-Tap action', () => {
      const response = 'do(action="Swipe", start=[100,200], end=[300,400])';
      const result = parseAutoGLMLocateResponse(response);
      expect(result.error).toBe(
        'Unexpected action type in auto-glm locate response: do(action="Swipe", start=[100,200], end=[300,400])',
      );
      expect(result.coordinates).toBeNull();
    });

    it('should return error for malformed response', () => {
      const response = 'do(action="Tap", invalid=[500,750])';
      const result = parseAutoGLMLocateResponse(response);
      expect(result.error).toBe(
        'Failed to extract element coordinates from auto-glm response: do(action="Tap", invalid=[500,750])',
      );
      expect(result.coordinates).toBeNull();
    });
  });
});

describe('auto-glm actions transformation', () => {
  it('should transform Tap action to Tap PlanningAction', () => {
    const tapAction: TapAction = {
      _metadata: 'do',
      action: 'Tap',
      element: [100, 200],
      think: 'Click button',
    };

    const result = transformAutoGLMAction(tapAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Tap');
    expect(result[0].param.locate.bbox).toHaveLength(4);
    expect(result[0].param.locate.bbox[0]).toBeGreaterThanOrEqual(0);
    expect(result[0].param.locate.bbox[2]).toBeLessThanOrEqual(
      defaultSize.width,
    );
  });

  it('should transform Double Tap action to DoubleClick PlanningAction', () => {
    const doubleTapAction: DoubleTapAction = {
      _metadata: 'do',
      action: 'Double Tap',
      element: [300, 400],
    };

    const result = transformAutoGLMAction(doubleTapAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('DoubleClick');
  });

  it('should transform Type action to Input PlanningAction', () => {
    // First set up a Tap action to record locate
    const tapAction: TapAction = {
      _metadata: 'do',
      action: 'Tap',
      element: [100, 200],
    };
    transformAutoGLMAction(tapAction, defaultSize);

    const typeAction: TypeAction = {
      _metadata: 'do',
      action: 'Type',
      text: 'Hello',
    };

    const result = transformAutoGLMAction(typeAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Input');
    expect((result[0].param as any).value).toBe('Hello');
  });

  it('should transform Swipe action to Scroll PlanningAction', () => {
    const swipeAction: SwipeAction = {
      _metadata: 'do',
      action: 'Swipe',
      start: [800, 500],
      end: [200, 500],
      think: 'Swipe left',
    };

    const result = transformAutoGLMAction(swipeAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Scroll');
    expect((result[0].param as any).direction).toBe('right');
    expect((result[0].param as any).distance).toBeGreaterThan(600);
  });

  it('should transform Long Press action to LongPress PlanningAction', () => {
    const longPressAction: LongPressAction = {
      _metadata: 'do',
      action: 'Long Press',
      element: [150, 250],
      think: 'Long press icon',
    };

    const result = transformAutoGLMAction(longPressAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('LongPress');
  });

  it('should transform Launch action to Launch PlanningAction', () => {
    const launchAction: LaunchAction = {
      _metadata: 'do',
      action: 'Launch',
      app: 'Camera',
    };

    const result = transformAutoGLMAction(launchAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Launch');
  });

  it('should transform Back action to AndroidBackButton PlanningAction', () => {
    const backAction: BackAction = {
      _metadata: 'do',
      action: 'Back',
      think: 'Go back',
    };

    const result = transformAutoGLMAction(backAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('AndroidBackButton');
  });

  it('should transform Home action to AndroidHomeButton PlanningAction', () => {
    const homeAction: HomeAction = {
      _metadata: 'do',
      action: 'Home',
    };

    const result = transformAutoGLMAction(homeAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('AndroidHomeButton');
  });

  it('should transform Wait action to Sleep PlanningAction', () => {
    const waitAction: WaitAction = {
      _metadata: 'do',
      action: 'Wait',
      durationMs: 2000,
      think: 'Wait for page load',
    };

    const result = transformAutoGLMAction(waitAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Sleep');
    expect((result[0].param as any).timeMs).toBe(2000);
  });

  it('should transform Finish action to Finished PlanningAction', () => {
    const finishAction: FinishAction = {
      _metadata: 'finish',
      message: 'Task completed successfully',
    };

    const result = transformAutoGLMAction(finishAction, defaultSize);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Finished');
  });

  it('should throw error for unsupported Interact action', () => {
    const interactAction: any = {
      _metadata: 'do',
      action: 'Interact',
    };

    expect(() => transformAutoGLMAction(interactAction, defaultSize)).toThrow(
      'not supported',
    );
  });

  it('should throw error for unsupported Call_API action', () => {
    const callApiAction: any = {
      _metadata: 'do',
      action: 'Call_API',
      instruction: 'call some API',
    };

    expect(() => transformAutoGLMAction(callApiAction, defaultSize)).toThrow(
      'not supported',
    );
  });

  it('should throw error for unsupported Take_over action', () => {
    const takeoverAction: any = {
      _metadata: 'do',
      action: 'Take_over',
      message: 'manual intervention',
    };

    expect(() => transformAutoGLMAction(takeoverAction, defaultSize)).toThrow(
      'not supported',
    );
  });

  it('should throw error for unsupported Note action', () => {
    const noteAction: any = {
      _metadata: 'do',
      action: 'Note',
      message: 'take a note',
    };

    expect(() => transformAutoGLMAction(noteAction, defaultSize)).toThrow(
      'not supported',
    );
  });
});

describe('auto-glm util functions', () => {
  describe('isAutoGLM', () => {
    it('should return true for auto-glm', () => {
      expect(isAutoGLM('auto-glm')).toBe(true);
    });

    it('should return true for auto-glm-multilingual', () => {
      expect(isAutoGLM('auto-glm-multilingual')).toBe(true);
    });

    it('should return false for other vlMode', () => {
      expect(isAutoGLM('qwen2.5-vl')).toBe(false);
      expect(isAutoGLM('gemini')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAutoGLM(undefined)).toBe(false);
    });
  });

  describe('swipe direction calculation', () => {
    it('should calculate left direction for swipe', () => {
      const swipeAction: SwipeAction = {
        _metadata: 'do',
        action: 'Swipe',
        start: [200, 500],
        end: [800, 500],
      };

      const result = transformAutoGLMAction(swipeAction, defaultSize);
      expect((result[0].param as any).direction).toBe('left');
    });

    it('should calculate right direction for swipe', () => {
      const swipeAction: SwipeAction = {
        _metadata: 'do',
        action: 'Swipe',
        start: [800, 500],
        end: [200, 500],
      };

      const result = transformAutoGLMAction(swipeAction, defaultSize);
      expect((result[0].param as any).direction).toBe('right');
    });

    it('should calculate down direction for swipe', () => {
      const swipeAction: SwipeAction = {
        _metadata: 'do',
        action: 'Swipe',
        start: [500, 200],
        end: [500, 800],
      };

      const result = transformAutoGLMAction(swipeAction, defaultSize);
      expect((result[0].param as any).direction).toBe('up');
      // deltaY = 600, distance = 600 * 1920 / 1000 = 1152
      expect((result[0].param as any).distance).toBeGreaterThan(1100);
    });

    it('should calculate up direction for swipe', () => {
      const swipeAction: SwipeAction = {
        _metadata: 'do',
        action: 'Swipe',
        start: [500, 800],
        end: [500, 200],
      };

      const result = transformAutoGLMAction(swipeAction, defaultSize);
      expect((result[0].param as any).direction).toBe('down');
      // deltaY = -600, distance = 600 * 1920 / 1000 = 1152
      expect((result[0].param as any).distance).toBeGreaterThan(1100);
    });
  });
});
