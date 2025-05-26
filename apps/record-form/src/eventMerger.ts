// 事件合并工具类

export interface EventMergeConfig {
  timeWindow: number;
  enabled: boolean;
}

export interface MergeableEvent {
  id?: string | number;
  type: string;
  timestamp?: number;
  x?: number;
  y?: number;
  value?: string;
  [key: string]: any;
}

export class EventMerger {
  private config: Record<string, EventMergeConfig>;
  private maxEvents: number;

  constructor(config: Record<string, EventMergeConfig> = {}, maxEvents = 500) {
    this.config = {
      scroll: { timeWindow: 100, enabled: true },
      input: { timeWindow: 200, enabled: true },
      ...config,
    };
    this.maxEvents = maxEvents;
  }

  /**
   * 检查两个事件是否应该合并
   */
  shouldMergeEvents(
    lastEvent: MergeableEvent,
    currentEvent: MergeableEvent,
  ): boolean {
    if (!lastEvent || !currentEvent) return false;

    const eventConfig = this.config[currentEvent.type];

    // 检查是否启用了该类型事件的合并
    if (!eventConfig?.enabled) return false;

    // 检查是否为相同类型和元素的事件
    if (
      lastEvent.type === currentEvent.type &&
      lastEvent.id === currentEvent.id
    ) {
      // 检查时间窗口
      if (currentEvent.timestamp && lastEvent.timestamp) {
        const timeDiff = currentEvent.timestamp - lastEvent.timestamp;
        return timeDiff < eventConfig.timeWindow;
      }
    }

    return false;
  }

  /**
   * 合并两个事件
   */
  mergeEvent(
    lastEvent: MergeableEvent,
    currentEvent: MergeableEvent,
  ): MergeableEvent {
    const mergedEvent = { ...currentEvent };

    if (currentEvent.type === 'scroll') {
      // 滚动事件：保持最新的位置
      mergedEvent.value = `${currentEvent.x || 0},${currentEvent.y || 0}`;
      console.log('🔄 合并滚动事件:', {
        from: `${lastEvent.x || 0},${lastEvent.y || 0}`,
        to: `${currentEvent.x || 0},${currentEvent.y || 0}`,
        timeDiff: (currentEvent.timestamp || 0) - (lastEvent.timestamp || 0),
      });
    } else if (currentEvent.type === 'input') {
      // 输入事件：保持最新的值
      mergedEvent.value = currentEvent.value;
      console.log('🔄 合并输入事件:', {
        from: lastEvent.value,
        to: currentEvent.value,
        timeDiff: (currentEvent.timestamp || 0) - (lastEvent.timestamp || 0),
      });
    }

    return mergedEvent;
  }

  /**
   * 处理事件数组，自动合并相似事件
   */
  processEventArray(
    prevEvents: MergeableEvent[],
    newEvent: MergeableEvent,
    onMerge?: () => void,
  ): MergeableEvent[] {
    // 检查是否需要合并事件
    if (prevEvents.length > 0) {
      const lastEvent = prevEvents[prevEvents.length - 1];

      if (this.shouldMergeEvents(lastEvent, newEvent)) {
        const newArray = [...prevEvents];

        // 调用合并回调
        onMerge?.();

        // 合并事件
        newArray[newArray.length - 1] = this.mergeEvent(lastEvent, newEvent);

        return this.limitArraySize(newArray);
      }
    }

    // 否则正常添加事件
    const newArray = [...prevEvents, newEvent];
    console.log('➕ 添加新事件:', newEvent.type, newEvent);
    return this.limitArraySize(newArray);
  }

  /**
   * 限制数组大小，避免内存泄漏
   */
  private limitArraySize(events: MergeableEvent[]): MergeableEvent[] {
    return events.length > this.maxEvents
      ? events.slice(-this.maxEvents)
      : events;
  }

  /**
   * 获取当前配置
   */
  getConfig(): Record<string, EventMergeConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<Record<string, EventMergeConfig>>): void {
    Object.keys(newConfig).forEach((key) => {
      const config = newConfig[key];
      if (config) {
        this.config[key] = config;
      }
    });
  }

  /**
   * 获取最大事件数量
   */
  getMaxEvents(): number {
    return this.maxEvents;
  }

  /**
   * 设置最大事件数量
   */
  setMaxEvents(maxEvents: number): void {
    this.maxEvents = maxEvents;
  }
}
