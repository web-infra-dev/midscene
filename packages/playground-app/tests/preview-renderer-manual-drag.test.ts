import { describe, expect, it } from 'vitest';
import {
  buildManualDragInteractPayload,
  buildManualScrollInteractPayload,
} from '../src/manual-interaction';

describe('buildManualDragInteractPayload', () => {
  it('maps mobile drag gestures to Swipe actions with duration', () => {
    expect(
      buildManualDragInteractPayload(
        'Swipe',
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        250,
      ),
    ).toEqual({
      actionType: 'Swipe',
      x: 10,
      y: 20,
      endX: 30,
      endY: 40,
      duration: 250,
    });
  });

  it('maps web drag gestures to DragAndDrop actions without swipe duration', () => {
    expect(
      buildManualDragInteractPayload(
        'DragAndDrop',
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        250,
      ),
    ).toEqual({
      actionType: 'DragAndDrop',
      x: 10,
      y: 20,
      endX: 30,
      endY: 40,
    });
  });
});

describe('buildManualScrollInteractPayload', () => {
  it('maps vertical wheel deltas to a Scroll action', () => {
    expect(
      buildManualScrollInteractPayload(
        { x: 10, y: 20 },
        { deltaX: 0, deltaY: 120 },
      ),
    ).toEqual({
      actionType: 'Scroll',
      x: 10,
      y: 20,
      scrollType: 'singleAction',
      direction: 'down',
      distance: 120,
    });
  });

  it('maps horizontal wheel deltas to left and right directions', () => {
    expect(
      buildManualScrollInteractPayload(
        { x: 10, y: 20 },
        { deltaX: -45, deltaY: 2 },
      ),
    ).toMatchObject({
      direction: 'left',
      distance: 45,
    });
  });
});
