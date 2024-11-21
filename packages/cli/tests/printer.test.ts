import {
  currentSpinningFrame,
  flowItemBrief,
  isTTY,
  spinnerFrames,
  spinnerInterval,
} from '@/printer';
import { describe, expect, test } from 'vitest';

describe('printer', () => {
  test('action brief text', () => {
    expect(flowItemBrief({ ai: 'search for weather' })).toMatchSnapshot();
    expect(flowItemBrief({ sleep: 1000 })).toMatchSnapshot();
    expect(
      flowItemBrief({ aiWaitFor: 'wait for something' }),
    ).toMatchSnapshot();
  });
});
