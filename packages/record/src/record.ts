const DEBUG = localStorage.getItem('DEBUG') === 'true'; // Based on process.env.NODE_ENV

function debugLog(...args: any[]) {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[EventRecorder]', ...args);
  }
}

// Generate a hash ID based on elementRect and type
function generateHashId(
  type: string,
  elementRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
    x?: number;
    y?: number;
  },
): string {
  const rectStr = elementRect
    ? `${elementRect.left}_${elementRect.top}_${elementRect.width}_${elementRect.height}${elementRect.x !== undefined ? `_${elementRect.x}` : ''}${elementRect.y !== undefined ? `_${elementRect.y}` : ''}`
    : 'no_rect';
  const combined = `${type}_${rectStr}`;

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export interface ChromeRecordedEvent {
  type: 'click' | 'scroll' | 'input' | 'navigation' | 'setViewport' | 'keydown';
  url?: string;
  title?: string;
  value?: string;
  elementRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
  pageInfo: {
    width: number;
    height: number;
  };
  screenshotBefore?: string;
  screenshotAfter?: string;
  elementDescription?: string;
  // Loading state for AI description generation
  descriptionLoading?: boolean;
  // Boxed screenshot with element highlighted
  screenshotWithBox?: string;
  timestamp: number;
  hashId: string;
}

// Event type definition
export interface RecordedEvent extends ChromeRecordedEvent {
  element?: HTMLElement;
  targetTagName?: string;
  targetId?: string;
  targetClassName?: string;
  isLabelClick?: boolean;
  labelInfo?: {
    htmlFor?: string;
    textContent?: string;
  };
  isTrusted?: boolean;
  detail?: number;
  inputType?: string;
}

// Event callback function type
export type EventCallback = (event: RecordedEvent) => void;

// Check if it's the same input target
const isSameInputTarget = (
  event1: RecordedEvent,
  event2: RecordedEvent,
): boolean => {
  return event1.element === event2.element;
};

// Check if it's the same scroll target
const isSameScrollTarget = (
  event1: RecordedEvent,
  event2: RecordedEvent,
): boolean => {
  return event1.element === event2.element;
};

// Get the last label click event
const getLastLabelClick = (
  events: RecordedEvent[],
): RecordedEvent | undefined => {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === 'click' && event.isLabelClick) {
      return event;
    }
  }
  return undefined;
};

// Get all scrollable elements
function getAllScrollableElements(): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const all = document.querySelectorAll<HTMLElement>('body *');
  all.forEach((el) => {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const isScrollableY =
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight;
    const isScrollableX =
      (overflowX === 'auto' || overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth;
    if (isScrollableY || isScrollableX) {
      elements.push(el);
    }
  });
  return elements;
}

// Event recorder class
export class EventRecorder {
  private isRecording = false;
  private eventCallback: EventCallback;
  private scrollThrottleTimer: number | null = null;
  private scrollThrottleDelay = 200; // 200ms throttle
  private lastViewportScroll: { x: number; y: number } | null = null;
  private scrollTargets: HTMLElement[] = [];
  private sessionId: string;

  constructor(eventCallback: EventCallback, sessionId: string) {
    this.eventCallback = eventCallback;
    this.sessionId = sessionId;
  }

  // Start recording
  start(): void {
    if (this.isRecording) {
      debugLog('Recording already active, ignoring start request');
      return;
    }

    this.isRecording = true;
    debugLog('Starting event recording');

    // Handle scroll targets
    this.scrollTargets = [];
    // If not specified, automatically detect all scrollable areas
    if (this.scrollTargets.length === 0) {
      this.scrollTargets = getAllScrollableElements();
      // Also listen to page scrolling if page is scrollable
      this.scrollTargets.push(document.body);
    }

    debugLog(
      'Added event listeners for',
      this.scrollTargets.length,
      'scroll targets',
    );

    // Add event listeners
    document.addEventListener('click', this.handleClick);
    document.addEventListener('input', this.handleInput);
    document.addEventListener('scroll', this.handleScroll, { passive: true });
    this.scrollTargets.forEach((target) => {
      target.addEventListener('scroll', this.handleScroll, { passive: true });
    });
  }

  // Stop recording
  stop(): void {
    if (!this.isRecording) {
      debugLog('Recording not active, ignoring stop request');
      return;
    }

    this.isRecording = false;
    debugLog('Stopping event recording');

    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('input', this.handleInput);
    this.scrollTargets.forEach((target) => {
      target.removeEventListener('scroll', this.handleScroll);
    });

    debugLog('Removed all event listeners');
  }

  // Click event handler
  private handleClick = (event: MouseEvent): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;
    const { isLabelClick, labelInfo } = this.checkLabelClick(target);
    const rect = target.getBoundingClientRect();
    const elementRect = {
      left: Number(rect.left.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
      x: Number(event.clientX.toFixed(2)),
      y: Number(event.clientY.toFixed(2)),
    };
    const clickEvent: RecordedEvent = {
      type: 'click',
      elementRect,
      pageInfo: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      value: '',
      timestamp: Date.now(),
      hashId: generateHashId('click', {
        ...elementRect,
      }),
      element: target,
      isLabelClick,
      labelInfo,
      isTrusted: event.isTrusted,
      detail: event.detail,
      // pageWidth: window.innerWidth,
      // pageHeight: window.innerHeight,
    };

    this.eventCallback(clickEvent);
  };

  // Scroll event handler
  private handleScroll = (event: Event): void => {
    if (!this.isRecording) return;

    function isDocument(target: EventTarget): target is Document {
      return target instanceof Document;
    }

    const target = event.target as HTMLElement;
    const scrollXTarget = isDocument(target)
      ? window.scrollX
      : target.scrollLeft;
    const scrollYTarget = isDocument(target)
      ? window.scrollY
      : target.scrollTop;
    const rect = isDocument(target)
      ? {
          left: 0,
          top: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        }
      : target.getBoundingClientRect();
    // Throttle logic: throttle each target separately (can be extended to Map)
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
    }
    this.scrollThrottleTimer = window.setTimeout(() => {
      if (this.isRecording) {
        const elementRect = {
          left: isDocument(target) ? 0 : Number(rect.left.toFixed(2)),
          top: isDocument(target) ? 0 : Number(rect.top.toFixed(2)),
          width: isDocument(target)
            ? window.innerWidth
            : Number(rect.width.toFixed(2)),
          height: isDocument(target)
            ? window.innerHeight
            : Number(rect.height.toFixed(2)),
        };
        const scrollEvent: RecordedEvent = {
          type: 'scroll',
          elementRect,
          pageInfo: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          value: `${scrollXTarget.toFixed(2)},${scrollYTarget.toFixed(2)}`,
          timestamp: Date.now(),
          hashId: generateHashId('scroll', {
            ...elementRect,
          }),
          element: target,
          // pageWidth: window.innerWidth,
          // pageHeight: window.innerHeight,
        };
        this.eventCallback(scrollEvent);
      }
      this.scrollThrottleTimer = null;
    }, this.scrollThrottleDelay);
  };

  // Input event handler
  private handleInput = (event: Event): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const rect = target.getBoundingClientRect();
    const elementRect = {
      left: Number(rect.left.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
    };
    const inputEvent: RecordedEvent = {
      type: 'input',
      value: target.value,
      timestamp: Date.now(),
      hashId: generateHashId('input', {
        ...elementRect,
      }),
      element: target,
      inputType: target.type || 'text',
      elementRect,
      pageInfo: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };

    this.eventCallback(inputEvent);
  };

  // Check if it's a label click
  private checkLabelClick(target: HTMLElement): {
    isLabelClick: boolean;
    labelInfo: { htmlFor?: string; textContent?: string } | undefined;
  } {
    let isLabelClick = false;
    let labelInfo: { htmlFor?: string; textContent?: string } | undefined =
      undefined;

    if (target) {
      if (target.tagName === 'LABEL') {
        isLabelClick = true;
        labelInfo = {
          htmlFor: (target as HTMLLabelElement).htmlFor,
          textContent: target.textContent?.trim(),
        };
      } else {
        let parent = target.parentElement;
        while (parent) {
          if (parent.tagName === 'LABEL') {
            isLabelClick = true;
            labelInfo = {
              htmlFor: (parent as HTMLLabelElement).htmlFor,
              textContent: parent.textContent?.trim(),
            };
            break;
          }
          parent = parent.parentElement;
        }
      }
    }

    return { isLabelClick, labelInfo };
  }

  // Get recording status
  isActive(): boolean {
    return this.isRecording;
  }

  public optimizeEvent(
    event: RecordedEvent,
    events: RecordedEvent[],
  ): RecordedEvent[] {
    const lastEvent = events[events.length - 1];

    // If it's a click event, add directly
    if (event.type === 'click') {
      // Optimization: if the previous event is a label click and labelInfo.htmlFor equals current input's id, skip
      const lastEvent = getLastLabelClick(events);
      if (
        lastEvent &&
        lastEvent.type === 'click' &&
        lastEvent.isLabelClick &&
        lastEvent.labelInfo?.htmlFor === (event.element as HTMLInputElement).id
      ) {
        debugLog('Skip input event triggered by label click:', event.element);
        return events;
      }
      return [...events, event];
    }

    // If it's an input event, check if it should be skipped or merged
    if (event.type === 'input') {
      // Check if it should be skipped (triggered by label click)
      if (
        lastEvent &&
        lastEvent.type === 'click' &&
        lastEvent.isLabelClick &&
        lastEvent.labelInfo?.htmlFor === event.targetId
      ) {
        debugLog('Skipping input event - triggered by label click:', {
          labelHtmlFor: getLastLabelClick(events)?.labelInfo?.htmlFor,
          inputId: event.targetId,
          element: event.element,
        });
        return events;
      }

      // Check if it should be merged (consecutive inputs on the same input field)
      if (
        lastEvent &&
        lastEvent.type === 'input' &&
        isSameInputTarget(lastEvent, event)
      ) {
        const oldInputEvent = events[events.length - 1];
        const newEvents = [...events];
        newEvents[events.length - 1] = {
          value: (event.element as HTMLInputElement)?.value,
          ...event,
        };
        debugLog('Merging input event:', {
          oldValue: oldInputEvent.value,
          newValue: event.value,
          oldTimestamp: oldInputEvent.timestamp,
          newTimestamp: event.timestamp,
          target: event.targetTagName,
        });
        return newEvents;
      }
    }

    // If it's a scroll event, check if it should be replaced
    if (event.type === 'scroll') {
      if (
        lastEvent &&
        lastEvent.type === 'scroll' &&
        isSameScrollTarget(lastEvent, event)
      ) {
        const oldScrollEvent = events[events.length - 1];
        const newEvents = [...events];
        newEvents[events.length - 1] = event;
        debugLog('Replacing last scroll event with new scroll event:', {
          oldPosition: `${oldScrollEvent.elementRect?.left},${oldScrollEvent.elementRect?.top}`,
          newPosition: `${event.elementRect?.left},${event.elementRect?.top}`,
          oldTimestamp: oldScrollEvent.timestamp,
          newTimestamp: event.timestamp,
          target: event.targetTagName,
        });
        return newEvents;
      }
    }

    // Add other events directly
    return [...events, event];
  }
}
