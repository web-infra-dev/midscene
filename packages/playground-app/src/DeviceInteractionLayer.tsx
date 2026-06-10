import { PREVIEW_WHEEL_SCROLL_BATCH_DELAY_MS } from '@midscene/shared/constants';
import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
} from 'react';

// The package-local Vitest setup still uses the classic JSX runtime for this
// source file, so keep a runtime React binding even though the component code
// only references React types explicitly.
void React;

export interface DeviceSize {
  width: number;
  height: number;
}

export interface DeviceInteractionLayerProps {
  enabled: boolean;
  deviceSize?: DeviceSize | null;
  onTap?: (point: { x: number; y: number }) => void | Promise<void>;
  onSwipe?: (
    start: { x: number; y: number },
    end: { x: number; y: number },
    duration: number,
  ) => void;
  scrollEnabled?: boolean;
  onWheelScroll?: (
    point: { x: number; y: number },
    delta: { deltaX: number; deltaY: number },
  ) => void;
  keyboardEnabled?: boolean;
  onTextInput?: (text: string, point?: { x: number; y: number }) => void;
  onKeyboardPress?: (keyName: string, point?: { x: number; y: number }) => void;
  /**
   * Element whose bounding box represents the actual screen-mirror area
   * (the `<img>`/canvas container). When provided, pointer coordinates are
   * projected against this element instead of the overlay itself — so any
   * chrome wrapping the preview (toolbars, headers, padding) does not shift
   * taps downward.
   */
  contentRef?: React.RefObject<HTMLElement>;
  /**
   * Tap classification thresholds. Pointer movement below this distance and
   * total duration below this delay is reported as a Tap; anything else is a
   * Swipe.
   */
  tapMaxDistance?: number;
  tapMaxDurationMs?: number;
  style?: CSSProperties;
}

interface ActivePointer {
  startX: number;
  startY: number;
  startTime: number;
  contentRect: { left: number; top: number; width: number; height: number };
  keyboardFocusRequestId: number;
}

interface PendingWheelScroll {
  point: { x: number; y: number };
  deltaX: number;
  deltaY: number;
}

const keyboardControlKeys = new Set([
  'Backspace',
  'Delete',
  'Enter',
  'Tab',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

const pureModifierKeys = new Set(['Alt', 'Control', 'Meta', 'Shift']);

function isHostCopyShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'>,
): boolean {
  return (
    !event.altKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 'c'
  );
}

/**
 * Keys / shortcut combinations that should always reach the surrounding
 * Electron / browser host instead of being forwarded to the remote device.
 * The remote device already exposes its own reload / forward / stop buttons
 * in the navigation toolbar, so we err on the side of letting the host take
 * the standard window-level shortcuts.
 */
function isHostReservedShortcut(
  event: Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
  >,
): boolean {
  // Host-managed function keys.
  if (event.key === 'F5' || event.key === 'F11' || event.key === 'F12') {
    return true;
  }

  const hasPrimaryModifier = event.metaKey || event.ctrlKey;
  if (!hasPrimaryModifier) return false;

  const lowerKey = event.key.toLowerCase();

  // DevTools / Inspect: Cmd+Opt+I, Ctrl+Shift+I, Ctrl+Shift+J.
  if (event.altKey && lowerKey === 'i') return true;
  if (event.shiftKey && (lowerKey === 'i' || lowerKey === 'j')) {
    return true;
  }

  // Window / app-level shortcuts that users expect to control Studio itself,
  // even while a device is armed for keyboard input.
  const hostReservedKeys = new Set([
    'r', // reload (also Shift+R = force reload)
    'q', // quit
    'w', // close window/tab
    'm', // minimize
    'h', // hide (macOS)
    'n', // new window
    't', // new tab (rarely used in Studio but standard)
    '+',
    '=',
    '-',
    '_',
    '0', // zoom controls
  ]);
  return hostReservedKeys.has(lowerKey);
}

function hasHostSelectionOutsideOverlay(overlay: HTMLElement | null): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !overlay) return false;
  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode) return false;
  return !overlay.contains(anchorNode) && !overlay.contains(focusNode);
}

export function keyNameForKeyboardEvent(
  event: Pick<
    React.KeyboardEvent,
    'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
  >,
): string | null {
  if (pureModifierKeys.has(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey && event.key !== 'Shift') parts.push('Shift');

  parts.push(event.key === ' ' ? 'Space' : event.key);
  return parts.join('+');
}

export function inscribedContentRect(
  panel: { left: number; top: number; width: number; height: number },
  deviceSize: DeviceSize,
) {
  const aspect = deviceSize.width / deviceSize.height;
  if (panel.height <= 0 || panel.width <= 0) return panel;
  if (panel.width / panel.height > aspect) {
    const renderedWidth = panel.height * aspect;
    return {
      left: panel.left + (panel.width - renderedWidth) / 2,
      top: panel.top,
      width: renderedWidth,
      height: panel.height,
    };
  }
  const renderedHeight = panel.width / aspect;
  return {
    left: panel.left,
    top: panel.top + (panel.height - renderedHeight) / 2,
    width: panel.width,
    height: renderedHeight,
  };
}

export function DeviceInteractionLayer({
  enabled,
  deviceSize,
  onTap,
  onSwipe,
  scrollEnabled = false,
  onWheelScroll,
  keyboardEnabled = false,
  onTextInput,
  onKeyboardPress,
  contentRef,
  tapMaxDistance = 8,
  tapMaxDurationMs = 250,
  style,
}: DeviceInteractionLayerProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const keyboardSinkRef = useRef<HTMLTextAreaElement | null>(null);
  const activePointer = useRef<ActivePointer | null>(null);
  const composingRef = useRef(false);
  const keyboardArmedRef = useRef(false);
  const keyboardFocusRequestIdRef = useRef(0);
  const lastKeyboardPointRef = useRef<{ x: number; y: number } | null>(null);
  const pendingWheelRef = useRef<PendingWheelScroll | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusKeyboardSink = useCallback(() => {
    if (keyboardEnabled) {
      keyboardArmedRef.current = true;
      keyboardSinkRef.current?.focus({ preventScroll: true });
    }
  }, [keyboardEnabled]);

  const refocusKeyboardSinkAfterTap = useCallback(
    (focusRequestId: number, interaction: void | Promise<void>) => {
      if (!keyboardEnabled) return;
      void Promise.resolve(interaction)
        .catch(() => undefined)
        .then(() => {
          window.setTimeout(() => {
            if (
              keyboardArmedRef.current &&
              keyboardFocusRequestIdRef.current === focusRequestId
            ) {
              focusKeyboardSink();
            }
          }, 0);
        });
    },
    [focusKeyboardSink, keyboardEnabled],
  );

  const positionKeyboardSink = useCallback(
    (clientX: number, clientY: number) => {
      const overlay = overlayRef.current;
      const sink = keyboardSinkRef.current;
      if (!overlay || !sink) return;
      const rect = overlay.getBoundingClientRect();
      sink.style.left = `${Math.max(0, clientX - rect.left)}px`;
      sink.style.top = `${Math.max(0, clientY - rect.top)}px`;
    },
    [],
  );

  const projectToDevice = useCallback(
    (
      clientX: number,
      clientY: number,
      contentRect: { left: number; top: number; width: number; height: number },
    ) => {
      if (!deviceSize) return null;
      const ratioX = (clientX - contentRect.left) / contentRect.width;
      const ratioY = (clientY - contentRect.top) / contentRect.height;
      const x = Math.max(
        0,
        Math.min(deviceSize.width - 1, Math.round(ratioX * deviceSize.width)),
      );
      const y = Math.max(
        0,
        Math.min(deviceSize.height - 1, Math.round(ratioY * deviceSize.height)),
      );
      return { x, y };
    },
    [deviceSize],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !deviceSize || !overlayRef.current) return;
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const measurementSource = contentRef?.current ?? overlayRef.current;
      const panelRect = measurementSource.getBoundingClientRect();
      const contentRect = inscribedContentRect(panelRect, deviceSize);
      if (
        event.clientX < contentRect.left ||
        event.clientX > contentRect.left + contentRect.width ||
        event.clientY < contentRect.top ||
        event.clientY > contentRect.top + contentRect.height
      ) {
        keyboardArmedRef.current = false;
        return;
      }
      positionKeyboardSink(event.clientX, event.clientY);
      const keyboardFocusRequestId = keyboardFocusRequestIdRef.current + 1;
      keyboardFocusRequestIdRef.current = keyboardFocusRequestId;
      focusKeyboardSink();
      try {
        overlayRef.current.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic/devtools pointer events may not have an active pointer */
      }
      activePointer.current = {
        startX: event.clientX,
        startY: event.clientY,
        startTime: performance.now(),
        contentRect,
        keyboardFocusRequestId,
      };
      event.preventDefault();
    },
    [contentRef, enabled, deviceSize, focusKeyboardSink, positionKeyboardSink],
  );

  const finishPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const active = activePointer.current;
      activePointer.current = null;
      if (!active) return;
      try {
        overlayRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const duration = Math.max(0, performance.now() - active.startTime);

      const startPoint = projectToDevice(
        active.startX,
        active.startY,
        active.contentRect,
      );
      const endPoint = projectToDevice(
        event.clientX,
        event.clientY,
        active.contentRect,
      );
      if (!startPoint || !endPoint) return;
      lastKeyboardPointRef.current = endPoint;

      if (distance <= tapMaxDistance && duration <= tapMaxDurationMs) {
        refocusKeyboardSinkAfterTap(
          active.keyboardFocusRequestId,
          onTap?.(startPoint),
        );
      } else {
        onSwipe?.(startPoint, endPoint, Math.round(duration));
      }
    },
    [
      onTap,
      onSwipe,
      projectToDevice,
      refocusKeyboardSinkAfterTap,
      tapMaxDistance,
      tapMaxDurationMs,
    ],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => finishPointer(event, false),
    [finishPointer],
  );
  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => finishPointer(event, true),
    [finishPointer],
  );

  const flushPendingWheel = useCallback(() => {
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = null;
    if (wheelTimerRef.current) {
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = null;
    }
    if (!pending) return;
    onWheelScroll?.(pending.point, {
      deltaX: pending.deltaX,
      deltaY: pending.deltaY,
    });
  }, [onWheelScroll]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!enabled || !scrollEnabled || !deviceSize || !overlayRef.current) {
        return;
      }
      const measurementSource = contentRef?.current ?? overlayRef.current;
      const panelRect = measurementSource.getBoundingClientRect();
      const contentRect = inscribedContentRect(panelRect, deviceSize);
      if (
        event.clientX < contentRect.left ||
        event.clientX > contentRect.left + contentRect.width ||
        event.clientY < contentRect.top ||
        event.clientY > contentRect.top + contentRect.height
      ) {
        return;
      }

      const point = projectToDevice(event.clientX, event.clientY, contentRect);
      if (!point) return;

      event.preventDefault();
      event.stopPropagation();

      const current = pendingWheelRef.current;
      pendingWheelRef.current = {
        point,
        deltaX: (current?.deltaX || 0) + event.deltaX,
        deltaY: (current?.deltaY || 0) + event.deltaY,
      };

      if (wheelTimerRef.current) {
        clearTimeout(wheelTimerRef.current);
      }
      wheelTimerRef.current = setTimeout(
        flushPendingWheel,
        PREVIEW_WHEEL_SCROLL_BATCH_DELAY_MS,
      );
    },
    [
      contentRef,
      deviceSize,
      enabled,
      flushPendingWheel,
      projectToDevice,
      scrollEnabled,
    ],
  );

  const clearLocalEditableText = useCallback(() => {
    if (keyboardSinkRef.current?.value) {
      keyboardSinkRef.current.value = '';
    }
  }, []);

  const handleKeyboardEvent = useCallback(
    (event: KeyboardEvent) => {
      if (!keyboardEnabled || !keyboardArmedRef.current) return;
      if (
        isHostCopyShortcut(event) &&
        hasHostSelectionOutsideOverlay(overlayRef.current)
      ) {
        keyboardArmedRef.current = false;
        return;
      }
      if (composingRef.current || event.isComposing) {
        return;
      }
      // Let Electron / browser-level shortcuts reach the host so users keep
      // standard reload / devtools / window-management behavior.
      if (isHostReservedShortcut(event)) {
        return;
      }

      if (
        keyboardControlKeys.has(event.key) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        const keyName = keyNameForKeyboardEvent(event);
        if (!keyName) return;
        event.preventDefault();
        event.stopPropagation();
        onKeyboardPress?.(keyName, lastKeyboardPointRef.current ?? undefined);
      }
    },
    [keyboardEnabled, onKeyboardPress],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!keyboardEnabled || !keyboardArmedRef.current) return;
      const text = event.clipboardData.getData('text');
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      onTextInput?.(text, lastKeyboardPointRef.current ?? undefined);
    },
    [keyboardEnabled, onTextInput],
  );

  const handleEditableInput = useCallback(
    (event: React.FormEvent<HTMLTextAreaElement>) => {
      if (!keyboardEnabled || !keyboardArmedRef.current) {
        if (!composingRef.current) {
          clearLocalEditableText();
        }
        return;
      }
      if (composingRef.current) {
        return;
      }
      const nativeEvent = event.nativeEvent as InputEvent;
      if (nativeEvent.inputType === 'insertLineBreak') {
        clearLocalEditableText();
        event.preventDefault();
        event.stopPropagation();
        onKeyboardPress?.('Enter', lastKeyboardPointRef.current ?? undefined);
        return;
      }
      if (nativeEvent.inputType === 'deleteContentBackward') {
        clearLocalEditableText();
        event.preventDefault();
        event.stopPropagation();
        onKeyboardPress?.(
          'Backspace',
          lastKeyboardPointRef.current ?? undefined,
        );
        return;
      }
      if (nativeEvent.inputType === 'deleteContentForward') {
        clearLocalEditableText();
        event.preventDefault();
        event.stopPropagation();
        onKeyboardPress?.('Delete', lastKeyboardPointRef.current ?? undefined);
        return;
      }
      const text = nativeEvent.data || keyboardSinkRef.current?.value || '';
      clearLocalEditableText();
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      onTextInput?.(text, lastKeyboardPointRef.current ?? undefined);
    },
    [clearLocalEditableText, keyboardEnabled, onKeyboardPress, onTextInput],
  );

  useEffect(() => {
    if (!enabled) {
      activePointer.current = null;
      pendingWheelRef.current = null;
      if (wheelTimerRef.current) {
        clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = null;
      }
      composingRef.current = false;
      keyboardArmedRef.current = false;
      lastKeyboardPointRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !keyboardEnabled) {
      keyboardArmedRef.current = false;
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const overlay = overlayRef.current;
      if (
        overlay &&
        event.target instanceof Node &&
        overlay.contains(event.target)
      ) {
        return;
      }
      keyboardArmedRef.current = false;
    };

    window.addEventListener('keydown', handleKeyboardEvent, true);
    window.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyboardEvent, true);
      window.removeEventListener(
        'pointerdown',
        handleDocumentPointerDown,
        true,
      );
    };
  }, [enabled, handleKeyboardEvent, keyboardEnabled]);

  useEffect(() => {
    return () => {
      if (wheelTimerRef.current) {
        clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = null;
      }
    };
  }, []);

  if (!enabled || !deviceSize) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      data-midscene-device-interaction-layer="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        cursor: keyboardEnabled ? 'default' : 'crosshair',
        outline: 'none',
        color: 'transparent',
        caretColor: 'transparent',
        touchAction: 'none',
        userSelect: 'none',
        ...style,
      }}
    >
      {keyboardEnabled ? (
        <textarea
          ref={keyboardSinkRef}
          data-midscene-keyboard-sink="true"
          tabIndex={-1}
          onPaste={handlePaste}
          onCompositionStart={() => {
            keyboardArmedRef.current = true;
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            if (!keyboardEnabled || !keyboardArmedRef.current) return;
            composingRef.current = false;
            const text = event.data || keyboardSinkRef.current?.value || '';
            clearLocalEditableText();
            if (text) {
              onTextInput?.(text, lastKeyboardPointRef.current ?? undefined);
            }
          }}
          onInput={handleEditableInput}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 32,
            height: 24,
            opacity: 0.01,
            pointerEvents: 'none',
            resize: 'none',
            border: 0,
            padding: 0,
            margin: 0,
            outline: 'none',
            background: 'transparent',
            color: 'transparent',
            caretColor: 'transparent',
            fontSize: 16,
            lineHeight: '20px',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ) : null}
    </div>
  );
}
