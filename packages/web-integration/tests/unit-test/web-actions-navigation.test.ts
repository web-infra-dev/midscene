import { describe, expect, it, vi } from 'vitest';
import { commonWebActionsForWebPage } from '../../src/web-page';

describe('commonWebActionsForWebPage navigation actions', () => {
  it('exposes forward and stop actions for manual browser chrome controls', async () => {
    const page = {
      goForward: vi.fn(async () => undefined),
      stopLoading: vi.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'GoForward')
      ?.call(undefined);
    await actions.find((action) => action.name === 'Stop')?.call(undefined);

    expect(page.goForward).toHaveBeenCalledTimes(1);
    expect(page.stopLoading).toHaveBeenCalledTimes(1);
  });
});

describe('commonWebActionsForWebPage visual refresh', () => {
  it('refreshes the preview after keyboard-only actions', async () => {
    const page = {
      keyboard: {
        press: vi.fn(async () => undefined),
      },
      flushPendingVisualUpdate: vi.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'KeyboardPress')
      ?.call({ keyName: 'Meta+A' });

    expect(page.keyboard.press).toHaveBeenCalledTimes(1);
    expect(page.flushPendingVisualUpdate).toHaveBeenCalledTimes(1);
  });

  it('refreshes the preview after text input actions', async () => {
    const page = {
      keyboard: {
        type: vi.fn(async () => undefined),
      },
      flushPendingVisualUpdate: vi.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Input')
      ?.call({ value: 'hello', mode: 'typeOnly' });

    expect(page.keyboard.type).toHaveBeenCalledWith('hello');
    expect(page.flushPendingVisualUpdate).toHaveBeenCalledTimes(1);
  });
});
