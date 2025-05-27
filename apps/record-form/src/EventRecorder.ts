const DEBUG = localStorage.getItem('DEBUG') === 'true'; // Based on process.env.NODE_ENV

function debugLog(...args: any[]) {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

// Event type definition
export interface RecordedEvent {
  type: 'click' | 'scroll' | 'input' | 'navigation';
  timestamp: number;
  x?: number;
  y?: number;
  value?: string;
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
  url?: string;
  viewportX?: number;
  viewportY?: number;
  width?: number; // Element width
  height?: number; // Element height
}

// Event callback function type
export type EventCallback = (event: RecordedEvent) => void;

// Check if it's the same input target
const isSameInputTarget = (
  event1: RecordedEvent,
  event2: RecordedEvent,
): boolean => {
  if (event1.targetTagName !== event2.targetTagName) {
    return false;
  }
  if (event1.targetId && event2.targetId) {
    return event1.targetId === event2.targetId;
  }
  if (!event1.targetId && !event2.targetId) {
    return event1.targetTagName === event2.targetTagName;
  }
  return false;
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
  private scrollTargets: HTMLElement[] = [];

  constructor(eventCallback: EventCallback) {
    this.eventCallback = eventCallback;
  }

  // Start recording
  start(): void {
    if (this.isRecording) return;
    this.isRecording = true;

    // Handle scroll targets
    this.scrollTargets = [];
    // If not specified, automatically detect all scrollable areas
    if (this.scrollTargets.length === 0) {
      this.scrollTargets = getAllScrollableElements();
      // Also listen to page scrolling if page is scrollable
      this.scrollTargets.push(document.body);
    }

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
    if (!this.isRecording) return;
    this.isRecording = false;
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('input', this.handleInput);
    this.scrollTargets.forEach((target) => {
      target.removeEventListener('scroll', this.handleScroll);
    });
  }

  // Click event handler
  private handleClick = (event: MouseEvent): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;
    const { isLabelClick, labelInfo } = this.checkLabelClick(target);
    const rect = target.getBoundingClientRect();

    const clickEvent: RecordedEvent = {
      type: 'click',
      x: event.clientX,
      y: event.clientY,
      value: '',
      timestamp: Date.now(),
      element: target,
      isLabelClick,
      labelInfo,
      isTrusted: event.isTrusted,
      detail: event.detail,
      viewportX: rect.left,
      viewportY: rect.top,
      width: rect.width, // Add width
      height: rect.height, // Add height
    };

    this.eventCallback(clickEvent);
  };

  // Scroll event handler
  private handleScroll = (event: Event): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;
    const scrollXTarget =
      target instanceof Document ? window.scrollX : target.scrollLeft;
    const scrollYTarget =
      target instanceof Document ? window.scrollY : target.scrollTop;
    const rect =
      target instanceof Document
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
        const scrollEvent: RecordedEvent = {
          type: 'scroll',
          x: scrollXTarget,
          y: scrollYTarget,
          value: `${scrollXTarget},${scrollYTarget}`,
          viewportX: rect.left,
          viewportY: rect.top,
          timestamp: Date.now(),
          element: target,
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

    const inputEvent: RecordedEvent = {
      type: 'input',
      value: target.value,
      timestamp: Date.now(),
      element: target,
      inputType: target.type || 'text',
      viewportX: rect.left,
      viewportY: rect.top,
      width: rect.width, // Add width
      height: rect.height, // Add height
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
          oldPosition: `${oldScrollEvent.x},${oldScrollEvent.y}`,
          newPosition: `${event.x},${event.y}`,
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
