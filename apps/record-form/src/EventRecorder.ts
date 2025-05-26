// 事件类型定义
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
}

// 事件回调函数类型
export type EventCallback = (event: RecordedEvent) => void;

// 事件记录器类
export class EventRecorder {
  private isRecording = false;
  private eventCallback: EventCallback;
  private scrollThrottleTimer: number | null = null;
  private scrollThrottleDelay = 1000; // 1000ms 节流
  private lastViewportScroll: { x: number; y: number } | null = null;

  constructor(eventCallback: EventCallback) {
    this.eventCallback = eventCallback;
  }

  // 开始记录
  start(): void {
    if (this.isRecording) return;

    this.isRecording = true;

    // 添加事件监听器
    document.addEventListener('click', this.handleClick);
    document.addEventListener('scroll', this.handleScroll);
    document.addEventListener('input', this.handleInput);

    // 添加页面加载事件
    const navigationEvent: RecordedEvent = {
      type: 'navigation',
      url: window.location.href,
      timestamp: Date.now(),
    };
    this.eventCallback(navigationEvent);
  }

  // 停止记录
  stop(): void {
    if (!this.isRecording) return;

    this.isRecording = false;

    // 清理滚动节流定时器
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }

    // 移除事件监听器
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('input', this.handleInput);
  }

  // 点击事件处理器
  private handleClick = (event: MouseEvent): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;

    // 检查是否是 label 触发的点击
    const { isLabelClick, labelInfo } = this.checkLabelClick(target);

    // 获取元素相对于 viewport 的位置
    const rect = target.getBoundingClientRect();

    const clickEvent: RecordedEvent = {
      type: 'click',
      x: event.clientX,
      y: event.clientY,
      value: '',
      timestamp: Date.now(),
      element: target,
      isLabelClick: isLabelClick,
      labelInfo: labelInfo,
      targetTagName: target?.tagName,
      targetId: target?.id,
      targetClassName: target?.className,
      isTrusted: event.isTrusted,
      detail: event.detail,
      viewportX: rect.left,
      viewportY: rect.top,
    };

    this.eventCallback(clickEvent);
  };

  // 滚动事件处理器
  private handleScroll = (event: Event): void => {
    if (!this.isRecording) return;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // 只在滚动位置发生变化时收集
    if (
      this.lastViewportScroll &&
      this.lastViewportScroll.x === scrollX &&
      this.lastViewportScroll.y === scrollY
    ) {
      return; // 没有变化，不收集
    }

    this.lastViewportScroll = { x: scrollX, y: scrollY };

    const target = event.target as HTMLElement;
    const scrollXTarget =
      target instanceof Document ? window.scrollX : target.scrollLeft;
    const scrollYTarget =
      target instanceof Document ? window.scrollY : target.scrollTop;

    // 始终保存最新的滚动事件
    const scrollEvent: RecordedEvent = {
      type: 'scroll',
      x: scrollXTarget,
      y: scrollYTarget,
      value: `${scrollXTarget},${scrollYTarget}`,
      timestamp: Date.now(),
      element: target,
      targetTagName: target?.tagName,
      targetId: target?.id,
      targetClassName: target?.className,
    };

    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
    }

    this.scrollThrottleTimer = window.setTimeout(() => {
      if (scrollEvent && this.isRecording) {
        this.eventCallback(scrollEvent);
      }
      this.scrollThrottleTimer = null;
    }, this.scrollThrottleDelay);
  };

  // 输入事件处理器
  private handleInput = (event: Event): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;

    // 获取元素相对于 viewport 的位置
    const rect = target.getBoundingClientRect();

    const inputEvent: RecordedEvent = {
      type: 'input',
      value: target.value,
      timestamp: Date.now(),
      element: target,
      targetTagName: target?.tagName,
      targetId: target?.id,
      targetClassName: target?.className,
      inputType: target.type || 'text',
      viewportX: rect.left,
      viewportY: rect.top,
    };

    this.eventCallback(inputEvent);
  };

  // 检查是否是 label 点击
  private checkLabelClick(target: HTMLElement): {
    isLabelClick: boolean;
    labelInfo: { htmlFor?: string; textContent?: string } | undefined;
  } {
    let isLabelClick = false;
    let labelInfo: { htmlFor?: string; textContent?: string } | undefined =
      undefined;

    if (target) {
      // 检查点击的元素本身是否是 label
      if (target.tagName === 'LABEL') {
        isLabelClick = true;
        labelInfo = {
          htmlFor: (target as HTMLLabelElement).htmlFor,
          textContent: target.textContent?.trim(),
        };
      } else {
        // 检查父元素是否是 label
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

  // 获取记录状态
  isActive(): boolean {
    return this.isRecording;
  }
}
