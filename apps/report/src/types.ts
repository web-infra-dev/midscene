import type { GroupedActionDump } from '@midscene/core';

// Core visualization types
export interface PlaywrightTaskAttributes {
  playwright_test_description: string;
  playwright_test_id: string;
  playwright_test_title: string;
  playwright_test_status:
    | 'passed'
    | 'failed'
    | 'timedOut'
    | 'skipped'
    | 'interrupted';
  playwright_test_duration: number;
}

export interface PlaywrightTasks {
  get: () => GroupedActionDump;
  attributes: PlaywrightTaskAttributes;
}

export interface VisualizerProps {
  logoAction?: () => void;
  dumps?: PlaywrightTasks[];
}
