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
  it('schedules the preview refresh after tap actions', async () => {
    const page = {
      mouse: {
        click: rs.fn(async () => undefined),
      },
      schedulePendingVisualUpdate: rs.fn(),
      flushPendingVisualUpdate: rs.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Tap')
      ?.call({ locate: { center: [10, 20] } } as any, mockExecutorContext);

    expect(page.mouse.click).toHaveBeenCalledWith(10, 20, { button: 'left' });
    expect(page.schedulePendingVisualUpdate).toHaveBeenCalledTimes(1);
    expect(page.flushPendingVisualUpdate).not.toHaveBeenCalled();
  });

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

    expect(page.keyboard.type).toHaveBeenCalledWith('hello', undefined);
    expect(page.schedulePendingVisualUpdate).toHaveBeenCalledTimes(1);
    expect(page.flushPendingVisualUpdate).not.toHaveBeenCalled();
  });

  it('schedules the preview refresh after scroll actions', async () => {
    const page = {
      scrollDown: rs.fn(async () => undefined),
      schedulePendingVisualUpdate: rs.fn(),
      flushPendingVisualUpdate: rs.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Scroll')
      ?.call(
        { direction: 'down', scrollType: 'singleAction' },
        mockExecutorContext,
      );

    expect(page.scrollDown).toHaveBeenCalledTimes(1);
    expect(page.schedulePendingVisualUpdate).toHaveBeenCalledTimes(1);
    expect(page.flushPendingVisualUpdate).not.toHaveBeenCalled();
  });

  it('schedules the preview refresh after navigation actions', async () => {
    const page = {
      navigate: rs.fn(async () => undefined),
      schedulePendingVisualUpdate: rs.fn(),
      flushPendingVisualUpdate: rs.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Navigate')
      ?.call({ url: 'https://example.com' }, mockExecutorContext);

    expect(page.navigate).toHaveBeenCalledWith('https://example.com');
    expect(page.schedulePendingVisualUpdate).toHaveBeenCalledTimes(1);
    expect(page.flushPendingVisualUpdate).not.toHaveBeenCalled();
  });

  it('passes action-level keyboardTypeDelay to text input actions', async () => {
    const page = {
      keyboard: {
        type: rs.fn(async () => undefined),
      },
      schedulePendingVisualUpdate: rs.fn(),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Input')
      ?.call(
        { value: 'hello', mode: 'typeOnly', keyboardTypeDelay: 25 },
        mockExecutorContext,
      );

    expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 25 });
  });
});
