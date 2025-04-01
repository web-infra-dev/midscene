import type { GroupedActionDump } from '@midscene/core';
import type { AnimationScript } from '@midscene/visualizer/playground';

// Core visualization types
export interface ExecutionDumpWithPlaywrightAttributes
  extends GroupedActionDump {
  attributes: Record<string, any>;
}

export interface VisualizerProps {
  logoAction?: () => void;
  dumps?: ExecutionDumpWithPlaywrightAttributes[];
}

// Store types
export interface StoreState {
  dump: GroupedActionDump | null;
  _executionDumpLoadId: number;
  replayAllMode: boolean;
  setReplayAllMode: (mode: boolean) => void;
  allExecutionAnimation: AnimationScript[] | null;
  insightWidth: number | null;
  insightHeight: number | null;
  setGroupedDump: (dump: GroupedActionDump) => void;
  reset: () => void;
}
