import type { ExecutorContext } from '@midscene/core';
import { describe, expect, it, rs } from '@rstest/core';
import { commonWebActionsForWebPage } from '../../src/web-page';

const mockExecutorContext = { task: {} } as ExecutorContext;

describe('commonWebActionsForWebPage navigation actions', () => {
  it('exposes forward without exposing stop as an action-space entry', async () => {
    const page = {
      goForward: rs.fn(async () => undefined),
      stopLoading: rs.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'GoForward')
      ?.call(undefined, mockExecutorContext);

    expect(page.goForward).toHaveBeenCalledTimes(1);
    expect(actions.find((action) => action.name === 'Stop')).toBeUndefined();
    expect(page.stopLoading).not.toHaveBeenCalled();
  });
});

describe('commonWebActionsForWebPage visual refresh', () => {
  it('schedules the preview refresh after keyboard-only actions', async () => {
    const page = {
      keyboard: {
        press: rs.fn(async () => undefined),
      },
      schedulePendingVisualUpdate: rs.fn(),
      flushPendingVisualUpdate: rs.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'KeyboardPress')
      ?.call({ keyName: 'Meta+A' }, mockExecutorContext);

    expect(page.keyboard.press).toHaveBeenCalledTimes(1);
    expect(page.schedulePendingVisualUpdate).toHaveBeenCalledTimes(1);
    expect(page.flushPendingVisualUpdate).not.toHaveBeenCalled();
  });

  it('schedules the preview refresh after text input actions', async () => {
    const page = {
      keyboard: {
        type: rs.fn(async () => undefined),
      },
      schedulePendingVisualUpdate: rs.fn(),
      flushPendingVisualUpdate: rs.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Input')
      ?.call({ value: 'hello', mode: 'typeOnly' }, mockExecutorContext);

    expect(page.keyboard.type).toHaveBeenCalledWith('hello');
    expect(page.schedulePendingVisualUpdate).toHaveBeenCalledTimes(1);
    expect(page.flushPendingVisualUpdate).not.toHaveBeenCalled();
  });
});
