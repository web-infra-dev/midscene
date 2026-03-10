// import { createStore } from 'zustand/vanilla';
import type { PlaywrightTaskAttributes } from '@/types';
import type {
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  GroupedActionDump,
  LocateResultElement,
  ServiceDump,
} from '@midscene/core';
import type { AnimationScript } from '@midscene/visualizer';
import {
  allScriptsFromDump,
  extractDumpMetaInfo,
  generateAnimationScripts,
} from '@midscene/visualizer';
import * as Z from 'zustand';

const { create } = Z;

export const isElementField = (value: unknown): value is LocateResultElement =>
  Boolean(value) &&
  typeof value === 'object' &&
  Boolean((value as any).center) &&
  Boolean((value as any).rect);

export const useBlackboardPreference = create<{
  markerVisible: boolean;
  elementsVisible: boolean;
  setMarkerVisible: (visible: boolean) => void;
  setTextsVisible: (visible: boolean) => void;
}>((set) => ({
  markerVisible: true,
  elementsVisible: true,
  setMarkerVisible: (visible: boolean) => {
    set({ markerVisible: visible });
  },
  setTextsVisible: (visible: boolean) => {
    set({ elementsVisible: visible });
  },
}));
export interface HistoryItem {
  type: 'aiAct' | 'aiQuery' | 'aiAssert';
  prompt: string;
  timestamp: number;
}

export interface DumpStoreType {
  dump: GroupedActionDump | null;
  playwrightAttributes: PlaywrightTaskAttributes | null;
  setGroupedDump: (
    dump: GroupedActionDump,
    playwrightAttributes?: PlaywrightTaskAttributes,
  ) => Promise<void>;
  _executionDumpLoadId: number;
  replayAllMode: boolean;
  setReplayAllMode: (replayAllMode: boolean) => void;
  allExecutionAnimation: AnimationScript[] | null;
  sdkVersion: string | null;
  modelBriefs: string[];
  insightWidth: number | null;
  insightHeight: number | null;
  deviceType: string | undefined;
  activeExecution: ExecutionDump | null;
  activeExecutionAnimation: AnimationScript[] | null;
  activeTask: ExecutionTask | null;
  setActiveTask: (task: ExecutionTask) => void;
  insightDump: ServiceDump | null;
  _contextLoadId: number;
  hoverTask: ExecutionTask | null;
  hoverTimestamp: number | null;
  setHoverTask: (task: ExecutionTask | null, timestamp?: number | null) => void;
  hoverPreviewConfig: { x: number; y: number } | null;
  setHoverPreviewConfig: (config: { x: number; y: number } | null) => void;
  playingTaskId: string | null;
  setPlayingTaskId: (taskId: string | null) => void;
  reset: () => void;
}
/**
/**
 * Service Mode
 *
 * - Server: use a node server to run the code
 * - In-Browser: use browser's fetch API to run the code
 * - In-Browser-Extension: use browser's fetch API to run the code, but the page is running in the extension context
 */
export type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension'; // | 'Extension';
export const useExecutionDump = create<DumpStoreType>((set, get) => {
  let _executionDumpLoadId = 0;
  const initData = {
    playwrightAttributes: null,
    dump: null,
    replayAllMode: false,
    allExecutionAnimation: null,
    sdkVersion: null,
    modelBriefs: [],
    insightWidth: null,
    insightHeight: null,
    deviceType: undefined,
    activeTask: null,
    activeExecution: null,
    activeExecutionAnimation: null,
    insightDump: null,
    _contextLoadId: 0,
    hoverTask: null,
    hoverTimestamp: null,
    hoverPreviewConfig: null,
    playingTaskId: null,
  };

  const resetActiveExecution = () => {
    set({
      activeTask: null,
      activeExecution: null,
      activeExecutionAnimation: null,
      _executionDumpLoadId: ++_executionDumpLoadId,
      insightDump: null,
    });
  };

  return {
    ...initData,
    _executionDumpLoadId,
    setReplayAllMode: (replayAllMode: boolean) => {
      const state = get();
      if (replayAllMode && !state.allExecutionAnimation) {
        // First time entering replay-all: generate scripts now
        const allScriptsInfo = allScriptsFromDump(state.dump);
        if (allScriptsInfo?.scripts.length) {
          set({
            allExecutionAnimation: allScriptsInfo.scripts,
            replayAllMode: true,
          });
          resetActiveExecution();
          return;
        }
      }
      if (state.allExecutionAnimation) {
        set({ replayAllMode });
        if (replayAllMode) {
          resetActiveExecution();
        }
      }
    },
    setGroupedDump: async (
      dump: GroupedActionDump,
      playwrightAttributes?: PlaywrightTaskAttributes,
    ) => {
      console.log('will set ExecutionDump', dump);
      set({
        ...initData,
        dump,
        playwrightAttributes,
      });

      if (dump && dump.executions.length > 0) {
        // Extract only metadata (dimensions, version, model info) — no .base64 reads
        const metaInfo = extractDumpMetaInfo(dump);
        if (!metaInfo) return;

        set({
          _executionDumpLoadId: ++_executionDumpLoadId,
          insightWidth: metaInfo.width,
          insightHeight: metaInfo.height,
          modelBriefs: metaInfo.modelBriefs,
          sdkVersion: metaInfo.sdkVersion,
          deviceType: metaInfo.deviceType,
        });

        // Default to first task static view instead of replay-all
        if (dump.executions[0].tasks.length > 0) {
          get().setActiveTask(dump.executions[0].tasks[0]);
        }
      }
    },
    setActiveTask(task: ExecutionTask) {
      let parentExecution: ExecutionDump | undefined;
      const state = get();
      const dump = state.dump;
      if (dump) {
        parentExecution = dump.executions.find((execution) =>
          execution.tasks.includes(task),
        );
      }
      if (!parentExecution) {
        throw new Error('parentExecution not found');
      }

      const width = state.insightWidth;
      const height = state.insightHeight;

      set({
        replayAllMode: false,
        activeTask: task,
        activeExecution: parentExecution,
        _executionDumpLoadId: ++_executionDumpLoadId,
        activeExecutionAnimation:
          width && height
            ? generateAnimationScripts(parentExecution, task, width, height)
            : null,
      });
      console.log('will set task', task);
      if (
        task.type === 'Insight' ||
        (task.type === 'Planning' && task.subType === 'Locate')
      ) {
        const dump = (task as ExecutionTaskPlanningLocate).log;
        set({
          insightDump: dump,
        });
      } else {
        set({ insightDump: null });
      }

      if (task.uiContext) {
        set({
          _contextLoadId: ++state._contextLoadId,
        });
      }
    },
    setHoverTask(task: ExecutionTask | null, timestamp?: number | null) {
      set({ hoverTask: task, hoverTimestamp: timestamp || null });
    },
    setHoverPreviewConfig(config: { x: number; y: number } | null) {
      if (config) {
        set({
          hoverPreviewConfig: {
            x: Math.floor(config.x),
            y: Math.floor(config.y),
          },
        });
      } else {
        set({ hoverPreviewConfig: null });
      }
    },
    setPlayingTaskId(taskId: string | null) {
      set({ playingTaskId: taskId });
    },
    reset: () => {
      set(initData);
    },
  };
});

export const useAllCurrentTasks = (): ExecutionTask[] => {
  const groupedDump = useExecutionDump((store) => store.dump);
  if (!groupedDump) return [];

  const tasksInside = groupedDump.executions.reduce<ExecutionTask[]>(
    (acc2, execution) => acc2.concat(execution.tasks),
    [],
  );

  return tasksInside;
};
