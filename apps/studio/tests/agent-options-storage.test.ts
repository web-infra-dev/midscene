// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadAgentOptions,
  saveAgentOptions,
} from '../src/renderer/components/ShellLayout/agent-options-storage';

describe('agent options storage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('persists and restores supported options', () => {
    saveAgentOptions({
      replanningCycleLimit: 12,
      waitAfterAction: 500,
      screenshotShrinkFactor: 2,
    });

    expect(loadAgentOptions()).toEqual({
      replanningCycleLimit: 12,
      waitAfterAction: 500,
      screenshotShrinkFactor: 2,
    });
  });

  it('filters unsupported and invalid stored fields', () => {
    localStorage.setItem(
      'studio:agent-options',
      JSON.stringify({
        replanningCycleLimit: -1,
        waitAfterAction: 500,
        screenshotShrinkFactor: 0.5,
        reportFileName: 'ignored.html',
      }),
    );

    expect(loadAgentOptions()).toEqual({ waitAfterAction: 500 });
  });

  it('preserves a zero replanning cycle limit', () => {
    saveAgentOptions({ replanningCycleLimit: 0 });
    expect(loadAgentOptions()).toEqual({ replanningCycleLimit: 0 });
  });

  it('recovers from malformed storage', () => {
    localStorage.setItem('studio:agent-options', '{invalid');
    expect(loadAgentOptions()).toEqual({});
  });
});
