import { describe, expect, it } from 'vitest';
import {
  agentOptionsToFormValues,
  parseAgentOptionFormValues,
} from '../src/component/config-modal';

describe('ConfigModal Agent options', () => {
  it('renders persisted options as editable values', () => {
    expect(
      agentOptionsToFormValues({
        replanningCycleLimit: 20,
        screenshotShrinkFactor: 2,
        waitAfterAction: 500,
      }),
    ).toEqual({
      replanningCycleLimit: '20',
      screenshotShrinkFactor: '2',
      waitAfterAction: '500',
    });
  });

  it('omits blank fields and parses valid values', () => {
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '0',
        screenshotShrinkFactor: '2.5',
        waitAfterAction: '',
      }),
    ).toEqual({
      error: null,
      options: {
        replanningCycleLimit: 0,
        screenshotShrinkFactor: 2.5,
      },
    });
  });

  it('rejects values outside the supported ranges', () => {
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '-1',
        screenshotShrinkFactor: '1',
        waitAfterAction: '300',
      }),
    ).toMatchObject({ options: null });
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '12',
        screenshotShrinkFactor: '0.5',
        waitAfterAction: '-1',
      }),
    ).toMatchObject({ options: null });
  });
});
