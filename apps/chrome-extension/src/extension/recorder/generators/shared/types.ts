import type { ChromeRecordedEvent } from '@midscene/recorder';

// Common interfaces for test generation
export interface EventCounts {
  navigation: number;
  click: number;
  input: number;
  scroll: number;
  total: number;
}

export interface InputDescription {
  description: string;
  value: string;
}

export interface ProcessedEvent {
  type: string;
  timestamp: number;
  url?: string;
  title?: string;
  elementDescription?: string;
  value?: string;
  pageInfo?: any;
  elementRect?: any;
}

export interface EventSummary {
  testName: string;
  startUrl: string;
  eventCounts: EventCounts;
  pageTitles: string[];
  urls: string[];
  clickDescriptions: string[];
  inputDescriptions: InputDescription[];
  events: ProcessedEvent[];
}

export interface TestGenerationOptions {
  testName?: string;
  includeScreenshots?: boolean;
  includeTimestamps?: boolean;
  maxScreenshots?: number;
  description?: string;
}

export interface PlaywrightGenerationOptions extends TestGenerationOptions {
  viewportSize?: { width: number; height: number };
  waitForNetworkIdle?: boolean;
  waitForNetworkIdleTimeout?: number;
}

export interface YamlGenerationOptions extends TestGenerationOptions {
  // YAML-specific options can be added here
}

export interface FilteredEvents {
  navigationEvents: ChromeRecordedEvent[];
  clickEvents: ChromeRecordedEvent[];
  inputEvents: ChromeRecordedEvent[];
  scrollEvents: ChromeRecordedEvent[];
}
