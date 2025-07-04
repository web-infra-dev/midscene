// import { createStore } from 'zustand/vanilla';
import type {
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskInsightLocate,
  GroupedActionDump,
  InsightDump,
} from '@midscene/core';
import type { AnimationScript } from '@midscene/visualizer';
import {
  allScriptsFromDump,
  generateAnimationScripts,
} from '@midscene/visualizer';
import * as Z from 'zustand';

const { create } = Z;
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
  type: 'aiAction' | 'aiQuery' | 'aiAssert';
  prompt: string;
  timestamp: number;
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
export const useExecutionDump = create<{
  dump: GroupedActionDump | null;
  setGroupedDump: (dump: GroupedActionDump) => void;
  _executionDumpLoadId: number;
  replayAllMode: boolean;
  setReplayAllMode: (replayAllMode: boolean) => void;
  allExecutionAnimation: AnimationScript[] | null;
  sdkVersion: string | null;
  modelName: string | null;
  modelDescription: string | null;
  insightWidth: number | null;
  insightHeight: number | null;
  activeExecution: ExecutionDump | null;
  activeExecutionAnimation: AnimationScript[] | null;
  activeTask: ExecutionTask | null;
  setActiveTask: (task: ExecutionTask) => void;
  insightDump: InsightDump | null;
  _contextLoadId: number;
  hoverTask: ExecutionTask | null;
  hoverTimestamp: number | null;
  setHoverTask: (task: ExecutionTask | null, timestamp?: number | null) => void;
  hoverPreviewConfig: { x: number; y: number } | null;
  setHoverPreviewConfig: (config: { x: number; y: number } | null) => void;
  reset: () => void;
}>((set, get) => {
  let _executionDumpLoadId = 0;
  const initData = {
    dump: null,
    replayAllMode: false,
    allExecutionAnimation: null,
    sdkVersion: null,
    modelName: null,
    modelDescription: null,
    insightWidth: null,
    insightHeight: null,
    activeTask: null,
    activeExecution: null,
    activeExecutionAnimation: null,
    insightDump: null,
    _contextLoadId: 0,
    hoverTask: null,
    hoverTimestamp: null,
    hoverPreviewConfig: null,
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
      if (state.allExecutionAnimation) {
        set({ replayAllMode });
        if (replayAllMode) {
          resetActiveExecution();
        }
      } else {
        console.error(
          'allExecutionAnimation not found, failed to set replayAllMode',
        );
      }
    },
    setGroupedDump: (dump: GroupedActionDump) => {
      console.log('will set ExecutionDump', dump);
      set({
        ...initData,
        dump,
      });

      // set the first task as selected

      if (dump && dump.executions.length > 0) {
        // const setDefaultActiveTask = () => {};

        const allScriptsInfo = allScriptsFromDump(dump);
        if (!allScriptsInfo) {
          return;
          // return setDefaultActiveTask();
        }

        const {
          scripts: allScripts,
          width,
          height,
          modelName,
          modelDescription,
          sdkVersion,
        } = allScriptsInfo;

        set({
          _executionDumpLoadId: ++_executionDumpLoadId,
          insightWidth: width,
          insightHeight: height,
          modelName,
          modelDescription,
          sdkVersion,
        });

        const replayAvailable = allScripts.length > 0;
        if (replayAvailable) {
          set({
            allExecutionAnimation: allScripts,
            replayAllMode: true,
          });
        } else {
          // set the first task as selected
          if (
            dump &&
            dump.executions.length > 0 &&
            dump.executions[0].tasks.length > 0
          ) {
            get().setActiveTask(dump.executions[0].tasks[0]);
          }
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
      if (task.type === 'Insight') {
        const dump = (task as ExecutionTaskInsightLocate).log?.dump!;
        set({
          insightDump: dump,
        });
      } else {
        set({ insightDump: null });
      }

      if (task.pageContext) {
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
