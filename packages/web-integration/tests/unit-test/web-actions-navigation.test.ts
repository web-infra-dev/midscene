import type { ExecutorContext } from '@midscene/core';
import { describe, expect, it, rs } from '@rstest/core';
import { PuppeteerWebPage } from '../../src/puppeteer/page';
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
    expect(page.schedulePendingVisualUpdate).toHaveBeenCalledWith(true);
    expect(page.flushPendingVisualUpdate).not.toHaveBeenCalled();
  });

  it('force-refreshes the preview after reload actions', async () => {
    const page = {
      reload: rs.fn(async () => undefined),
      schedulePendingVisualUpdate: rs.fn(),
      flushPendingVisualUpdate: rs.fn(async () => undefined),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Reload')
      ?.call(undefined, mockExecutorContext);

    expect(page.reload).toHaveBeenCalledTimes(1);
    expect(page.schedulePendingVisualUpdate).toHaveBeenCalledWith(true);
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

  it('uses the page-level bulk strategy when the action omits it', async () => {
    const page = {
      inputStrategy: 'bulk',
      keyboard: {
        insertText: rs.fn(async () => undefined),
        type: rs.fn(async () => undefined),
      },
      schedulePendingVisualUpdate: rs.fn(),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Input')
      ?.call({ value: '北京', mode: 'typeOnly' }, mockExecutorContext);

    expect(page.keyboard.insertText).toHaveBeenCalledWith('北京');
    expect(page.keyboard.type).not.toHaveBeenCalled();
  });

  it('sends Unicode code points separately for sequential input', async () => {
    const page = {
      keyboard: {
        insertText: rs.fn(async () => undefined),
        type: rs.fn(async () => undefined),
      },
      schedulePendingVisualUpdate: rs.fn(),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Input')
      ?.call(
        { value: 'A😀B', mode: 'typeOnly', inputStrategy: 'sequential' },
        mockExecutorContext,
      );

    expect(page.keyboard.type.mock.calls).toEqual([
      ['A', { delay: 0 }],
      ['😀', { delay: 0 }],
      ['B', { delay: 0 }],
    ]);
    expect(page.keyboard.insertText).not.toHaveBeenCalled();
  });

  it('lets action-level zero disable the page-level keyboard delay', async () => {
    const type = rs.fn(async () => undefined);
    const page = new PuppeteerWebPage({ keyboard: { type } } as any, {
      keyboardTypeDelay: 80,
    });
    const actions = commonWebActionsForWebPage(page);

    await actions
      .find((action) => action.name === 'Input')
      ?.call(
        {
          value: 'AB',
          mode: 'typeOnly',
          inputStrategy: 'sequential',
          keyboardTypeDelay: 0,
        },
        mockExecutorContext,
      );

    expect(type.mock.calls).toEqual([
      ['A', { delay: 0 }],
      ['B', { delay: 0 }],
    ]);
  });

  it('rejects an unsupported runtime strategy before typing', async () => {
    const page = {
      keyboard: {
        insertText: rs.fn(async () => undefined),
        type: rs.fn(async () => undefined),
      },
      schedulePendingVisualUpdate: rs.fn(),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await expect(
      actions
        .find((action) => action.name === 'Input')
        ?.call(
          {
            value: 'hello',
            mode: 'typeOnly',
            inputStrategy: 'paste' as any,
          },
          mockExecutorContext,
        ),
    ).rejects.toThrow(
      'inputStrategy must be one of: legacy, sequential, bulk; received paste',
    );
    expect(page.keyboard.type).not.toHaveBeenCalled();
    expect(page.keyboard.insertText).not.toHaveBeenCalled();
  });

  it('selects existing text without clearing before bulk replace input', async () => {
    const locate = { center: [10, 20] };
    const page = {
      keyboard: {
        insertText: rs.fn(async () => undefined),
        type: rs.fn(async () => undefined),
      },
      selectAllInput: rs.fn(async () => undefined),
      clearInput: rs.fn(async () => undefined),
      waitForDomQuiet: rs.fn(async () => undefined),
      schedulePendingVisualUpdate: rs.fn(),
    };
    const actions = commonWebActionsForWebPage(page as any);

    await actions
      .find((action) => action.name === 'Input')
      ?.call(
        { value: '上海', mode: 'replace', inputStrategy: 'bulk', locate },
        mockExecutorContext,
      );

    expect(page.selectAllInput).toHaveBeenCalledWith(locate);
    expect(page.keyboard.insertText).toHaveBeenCalledWith('上海');
    expect(page.clearInput).not.toHaveBeenCalled();
    expect(page.waitForDomQuiet).not.toHaveBeenCalled();
  });

  it('rejects bulk input with a configured positive keyboard delay', async () => {
    const page = {
      keyboardTypeDelay: 25,
      keyboard: {
        insertText: rs.fn(async () => undefined),
      },
      schedulePendingVisualUpdate: rs.fn(),
    };
    const actions = commonWebActionsForWebPage(page as any);
    const input = actions.find((action) => action.name === 'Input');

    await expect(
      input?.call(
        { value: 'hello', mode: 'typeOnly', inputStrategy: 'bulk' },
        mockExecutorContext,
      ),
    ).rejects.toThrow(
      'inputStrategy "bulk" requires keyboardTypeDelay to be omitted or set to 0; use inputStrategy "sequential" for delayed input',
    );
  });
});
