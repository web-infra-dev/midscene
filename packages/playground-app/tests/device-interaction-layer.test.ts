/** @vitest-environment jsdom */
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DeviceInteractionLayer,
  inscribedContentRect,
  keyNameForKeyboardEvent,
} from '../src/DeviceInteractionLayer';

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('inscribedContentRect', () => {
  it('letter-boxes horizontally when the panel is wider than device aspect', () => {
    // Panel: 1000x500 (2:1) – Device: 100x200 (portrait, 1:2)
    // Content should be a 250x500 rect centered horizontally.
    const rect = inscribedContentRect(
      { left: 0, top: 0, width: 1000, height: 500 },
      { width: 100, height: 200 },
    );
    expect(rect.height).toBe(500);
    expect(rect.width).toBe(250);
    expect(rect.left).toBe(375);
    expect(rect.top).toBe(0);
  });

  it('letter-boxes vertically when the panel is taller than device aspect', () => {
    // Panel: 500x1000 (1:2) – Device: 200x100 (landscape, 2:1)
    // Content should be a 500x250 rect centered vertically.
    const rect = inscribedContentRect(
      { left: 0, top: 0, width: 500, height: 1000 },
      { width: 200, height: 100 },
    );
    expect(rect.width).toBe(500);
    expect(rect.height).toBe(250);
    expect(rect.left).toBe(0);
    expect(rect.top).toBe(375);
  });

  it('preserves panel rect when aspect ratios match exactly', () => {
    const panel = { left: 10, top: 20, width: 300, height: 600 };
    const rect = inscribedContentRect(panel, { width: 100, height: 200 });
    expect(rect).toEqual(panel);
  });

  it('returns the panel unchanged when dimensions are zero or negative', () => {
    const panel = { left: 5, top: 5, width: 0, height: 100 };
    expect(inscribedContentRect(panel, { width: 9, height: 19 })).toEqual(
      panel,
    );
  });
});

describe('keyNameForKeyboardEvent', () => {
  it('builds keyboard shortcut names understood by /interact KeyboardPress', () => {
    expect(
      keyNameForKeyboardEvent({
        altKey: false,
        ctrlKey: false,
        key: 'Enter',
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe('Enter');
    expect(
      keyNameForKeyboardEvent({
        altKey: false,
        ctrlKey: false,
        key: 'Tab',
        metaKey: false,
        shiftKey: true,
      }),
    ).toBe('Shift+Tab');
    expect(
      keyNameForKeyboardEvent({
        altKey: false,
        ctrlKey: false,
        key: 'a',
        metaKey: true,
        shiftKey: false,
      }),
    ).toBe('Meta+a');
    expect(
      keyNameForKeyboardEvent({
        altKey: false,
        ctrlKey: false,
        key: 'Shift',
        metaKey: false,
        shiftKey: true,
      }),
    ).toBeNull();
  });
});

describe('DeviceInteractionLayer keyboard capture', () => {
  async function renderKeyboardLayer() {
    const onTextInput = vi.fn();
    const onKeyboardPress = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(DeviceInteractionLayer, {
          enabled: true,
          deviceSize: { width: 100, height: 100 },
          keyboardEnabled: true,
          onTextInput,
          onKeyboardPress,
        }),
      );
    });

    const overlay = container.querySelector(
      '[data-midscene-device-interaction-layer="true"]',
    ) as HTMLDivElement;
    Object.defineProperty(overlay, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(overlay, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(overlay, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const keyboardSink = container.querySelector(
      '[data-midscene-keyboard-sink="true"]',
    ) as HTMLTextAreaElement;

    return {
      container,
      keyboardSink,
      onKeyboardPress,
      onTextInput,
      overlay,
      root,
    };
  }

  it('focuses the overlay on pointer input and forwards typed characters', async () => {
    const { keyboardSink, onTextInput, overlay, root } =
      await renderKeyboardLayer();

    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
      overlay.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
    });

    expect(document.activeElement).toBe(keyboardSink);

    await act(async () => {
      keyboardSink.value = 'h';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'h',
          inputType: 'insertText',
        }),
      );
    });

    expect(onTextInput).toHaveBeenCalledWith('h', { x: 50, y: 50 });

    await act(async () => {
      root.unmount();
    });
  });

  it('forwards fallback input events, control keys, paste text, and composed IME text', async () => {
    const { keyboardSink, onKeyboardPress, onTextInput, overlay, root } =
      await renderKeyboardLayer();

    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
      overlay.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
    });

    await act(async () => {
      keyboardSink.value = 'i';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'i',
          inputType: 'insertText',
        }),
      );
    });

    expect(onTextInput).toHaveBeenCalledWith('i', { x: 50, y: 50 });

    await act(async () => {
      keyboardSink.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Backspace',
        }),
      );
      keyboardSink.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Tab',
          shiftKey: true,
        }),
      );
    });

    expect(onKeyboardPress).toHaveBeenNthCalledWith(1, 'Backspace', {
      x: 50,
      y: 50,
    });
    expect(onKeyboardPress).toHaveBeenNthCalledWith(2, 'Shift+Tab', {
      x: 50,
      y: 50,
    });

    await act(async () => {
      keyboardSink.value = '\n';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: null,
          inputType: 'insertLineBreak',
        }),
      );
    });

    expect(onKeyboardPress).toHaveBeenNthCalledWith(3, 'Enter', {
      x: 50,
      y: 50,
    });

    await act(async () => {
      const pasteEvent = new Event('paste', {
        bubbles: true,
        cancelable: true,
      }) as ClipboardEvent;
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          getData: (type: string) => (type === 'text' ? 'pasted text' : ''),
        },
      });
      keyboardSink.dispatchEvent(pasteEvent);
    });

    expect(onTextInput).toHaveBeenCalledWith('pasted text', { x: 50, y: 50 });

    await act(async () => {
      keyboardSink.dispatchEvent(
        new Event('compositionstart', {
          bubbles: true,
        }),
      );
      keyboardSink.value = 'zhong';
      keyboardSink.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: 'zhong',
          inputType: 'insertCompositionText',
        }),
      );
    });

    expect(keyboardSink.value).toBe('zhong');
    expect(onTextInput).not.toHaveBeenCalledWith('zhong', { x: 50, y: 50 });

    await act(async () => {
      const compositionEvent = new Event('compositionend', {
        bubbles: true,
      }) as CompositionEvent;
      Object.defineProperty(compositionEvent, 'data', {
        value: '中文',
      });
      keyboardSink.dispatchEvent(compositionEvent);
    });

    expect(onTextInput).toHaveBeenCalledWith('中文', { x: 50, y: 50 });

    await act(async () => {
      root.unmount();
    });
  });

  it('lets the host copy command run when Studio text is selected', async () => {
    const { onKeyboardPress, overlay, root } = await renderKeyboardLayer();

    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
      overlay.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        }),
      );
    });

    const hostText = document.createElement('span');
    hostText.textContent = 'copy me';
    document.body.appendChild(hostText);
    const range = document.createRange();
    range.selectNodeContents(hostText);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      metaKey: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onKeyboardPress).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});

describe('DeviceInteractionLayer contentRef projection', () => {
  // Regression for the iOS Playground tap-offset bug: the overlay covers the
  // whole preview panel (header + image), but coordinates must be projected
  // against the actual screen-mirror box so chrome above the image does not
  // shift taps downward.
  const overlayRect = {
    bottom: 800,
    height: 800,
    left: 0,
    right: 400,
    top: 0,
    width: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as const;
  // 80px of chrome at the top, then a 400x720 screen-mirror box that exactly
  // matches the device aspect (so there is no internal letterboxing).
  const contentRect = {
    bottom: 800,
    height: 720,
    left: 0,
    right: 400,
    top: 80,
    width: 400,
    x: 0,
    y: 80,
    toJSON: () => ({}),
  } as const;

  async function renderWithContentRef(options: {
    onTap: ReturnType<typeof vi.fn>;
    withContentRef: boolean;
  }) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const contentElement = document.createElement('div');
    document.body.appendChild(contentElement);
    Object.defineProperty(contentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => contentRect,
    });
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement | null }).current = contentElement;

    await act(async () => {
      root.render(
        createElement(DeviceInteractionLayer, {
          enabled: true,
          deviceSize: { width: 1000, height: 1800 },
          onTap: options.onTap,
          contentRef: options.withContentRef ? ref : undefined,
        }),
      );
    });

    const overlay = container.querySelector(
      '[data-midscene-device-interaction-layer="true"]',
    ) as HTMLDivElement;
    Object.defineProperty(overlay, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(overlay, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(overlay, 'getBoundingClientRect', {
      configurable: true,
      value: () => overlayRect,
    });

    return { container, contentElement, overlay, root };
  }

  it('projects taps against the screen-mirror box, not the surrounding overlay', async () => {
    const onTap = vi.fn();
    const { overlay, root } = await renderWithContentRef({
      onTap,
      withContentRef: true,
    });

    // Click 10% from the top of the actual screen-mirror box (which starts
    // 80px below the overlay top). clientY = 80 + 0.1*720 = 152.
    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 200,
          clientY: 152,
        }),
      );
      overlay.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
          clientX: 200,
          clientY: 152,
        }),
      );
    });

    // ratioX = 200/400 = 0.5  → x = 500
    // ratioY = (152-80)/720 = 0.1 → y = 180
    expect(onTap).toHaveBeenCalledWith({ x: 500, y: 180 });

    await act(async () => {
      root.unmount();
    });
  });

  it('falls back to the overlay rect when no contentRef is passed', async () => {
    const onTap = vi.fn();
    const { overlay, root } = await renderWithContentRef({
      onTap,
      withContentRef: false,
    });

    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 200,
          clientY: 152,
        }),
      );
      overlay.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
          clientX: 200,
          clientY: 152,
        }),
      );
    });

    // Without contentRef the projection uses the 400x800 overlay rect; the
    // 1000x1800 device aspect is taller than the panel, so the inscribed
    // image is 400x720 letterboxed with top = (800-720)/2 = 40.
    // ratioY = (152-40)/720 ≈ 0.1556 → y ≈ 280.
    expect(onTap).toHaveBeenCalledTimes(1);
    const projected = onTap.mock.calls[0][0];
    expect(projected.x).toBe(500);
    expect(projected.y).toBeGreaterThan(270);
    expect(projected.y).toBeLessThan(285);

    await act(async () => {
      root.unmount();
    });
  });
});
