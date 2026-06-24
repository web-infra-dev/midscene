import type {
  BackAction,
  DoubleTapAction,
  FinishAction,
  HomeAction,
  LaunchAction,
  LongPressAction,
  SwipeAction,
  TapAction,
  TypeAction,
  WaitAction,
} from '@/ai-model/models/auto-glm/actions';
import { parseAutoGLMPlanningAction } from '@/ai-model/models/auto-glm/parser';
import { describe, expect, it } from 'vitest';

describe('parseAutoGLMPlanningAction', () => {
  it('should parse Tap action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Need to click button',
      content: 'do(action="Tap", element=[100,200])',
    });
    expect(action._metadata).toBe('do');
    const tapAction = action as TapAction;
    expect(tapAction.action).toBe('Tap');
    expect(tapAction.element).toEqual([100, 200]);
  });

  it('should parse Double Tap action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Double click to zoom',
      content: 'do(action="Double Tap", element=[300,400])',
    });
    const doubleTapAction = action as DoubleTapAction;
    expect(doubleTapAction.action).toBe('Double Tap');
    expect(doubleTapAction.element).toEqual([300, 400]);
  });

  it('should parse Type action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Enter text',
      content: 'do(action="Type", text="Hello")',
    });
    const typeAction = action as TypeAction;
    expect(typeAction.action).toBe('Type');
    expect(typeAction.text).toBe('Hello');
  });

  it('should parse Swipe action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Swipe left',
      content: 'do(action="Swipe", start=[800,500], end=[200,500])',
    });
    const swipeAction = action as SwipeAction;
    expect(swipeAction.action).toBe('Swipe');
    expect(swipeAction.start).toEqual([800, 500]);
    expect(swipeAction.end).toEqual([200, 500]);
  });

  it('should parse Long Press action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Long press icon',
      content: 'do(action="Long Press", element=[150,250])',
    });
    const longPressAction = action as LongPressAction;
    expect(longPressAction.action).toBe('Long Press');
    expect(longPressAction.element).toEqual([150, 250]);
  });

  it('should parse Launch action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Launch app',
      content: 'do(action="Launch", app="Camera")',
    });
    const launchAction = action as LaunchAction;
    expect(launchAction.action).toBe('Launch');
    expect(launchAction.app).toBe('Camera');
  });

  it('should parse Back action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Go back',
      content: 'do(action="Back")',
    });
    const backAction = action as BackAction;
    expect(backAction.action).toBe('Back');
  });

  it('should parse Home action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Return home',
      content: 'do(action="Home")',
    });
    const homeAction = action as HomeAction;
    expect(homeAction.action).toBe('Home');
  });

  it('should parse Wait action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Wait for loading',
      content: 'do(action="Wait", duration="3")',
    });
    const waitAction = action as WaitAction;
    expect(waitAction.action).toBe('Wait');
    expect(waitAction.durationMs).toBe(3000);
  });

  it('should parse Finish action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'All done',
      content: 'finish(message="Task completed")',
    });
    const finishAction = action as FinishAction;
    expect(finishAction._metadata).toBe('finish');
    expect(finishAction.message).toBe('Task completed');
  });

  it('should parse Interact action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Need interaction',
      content: 'do(action="Interact")',
    });
    expect(action._metadata).toBe('do');
    expect((action as any).action).toBe('Interact');
  });

  it('should parse Call_API action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Call external API',
      content: 'do(action="Call_API", instruction="Get weather data")',
    });
    expect(action._metadata).toBe('do');
    expect((action as any).action).toBe('Call_API');
    expect((action as any).instruction).toBe('Get weather data');
  });

  it('should parse Take_over action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Manual intervention needed',
      content: 'do(action="Take_over", message="Please handle this manually")',
    });
    expect(action._metadata).toBe('do');
    expect((action as any).action).toBe('Take_over');
    expect((action as any).message).toBe('Please handle this manually');
  });

  it('should parse Note action', () => {
    const action = parseAutoGLMPlanningAction({
      think: 'Make a note',
      content: 'do(action="Note", message="Remember this step")',
    });
    expect(action._metadata).toBe('do');
    expect((action as any).action).toBe('Note');
    expect((action as any).message).toBe('Remember this step');
  });

  it('should throw error for unknown action type', () => {
    expect(() => {
      parseAutoGLMPlanningAction({
        think: 'Unknown',
        content: 'do(action="UnknownAction")',
      });
    }).toThrow('Unknown action type: UnknownAction');
  });

  it('should throw error for malformed do() call', () => {
    expect(() => {
      parseAutoGLMPlanningAction({
        think: 'Malformed',
        content: 'do(invalid syntax)',
      });
    }).toThrow('Failed to extract action type from do() call');
  });

  it('should throw error for Wait action without duration', () => {
    expect(() => {
      parseAutoGLMPlanningAction({
        think: 'Wait without duration',
        content: 'do(action="Wait")',
      });
    }).toThrow('Failed to extract duration for Wait');
  });
});
