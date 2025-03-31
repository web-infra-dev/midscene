import type { GroupedActionDump } from '@midscene/core';

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
  allExecutionAnimation: any[];
  insightWidth: number;
  insightHeight: number;
  setGroupedDump: (dump: GroupedActionDump) => void;
  reset: () => void;
}
