import * as Z from 'zustand';
// import { createStore } from 'zustand/vanilla';
import type {
  BaseElement,
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskInsightLocate,
  GroupedActionDump,
  InsightDump,
  UIContext,
} from '../../../midscene/dist/types';
import type { AnimationScript } from './replay-scripts';
import { allScriptsFromDump, generateAnimationScripts } from './replay-scripts';

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

export const usePlayground = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>((set) => {
  const initData = {
    open: false,
  };

  return {
    ...initData,
    setOpen: (open: boolean) => {
      set({ open });
    },
  };
});

export const useExecutionDump = create<{
  dump: GroupedActionDump | null;
  setGroupedDump: (dump: GroupedActionDump) => void;
  _executionDumpLoadId: number;
  replayAllMode: boolean;
  setReplayAllMode: (replayAllMode: boolean) => void;
  allExecutionAnimation: AnimationScript[] | null;
  insightWidth: number | null;
  insightHeight: number | null;
  activeExecution: ExecutionDump | null;
  activeExecutionAnimation: AnimationScript[] | null;
  activeTask: ExecutionTask | null;
  setActiveTask: (task: ExecutionTask) => void;
  insightDump: InsightDump | null;
  _insightDumpLoadId: number;
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
    activeTask: null,
    replayAllMode: false,
    allExecutionAnimation: null,
    insightWidth: null,
    insightHeight: null,
    activeExecution: null,
    activeExecutionAnimation: null,
    insightDump: null,
    _insightDumpLoadId: 0,
    hoverTask: null,
    hoverTimestamp: null,
    hoverPreviewConfig: null,
  };

  const resetActiveExecution = () => {
    set({
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
        const setDefaultActiveTask = () => {
          if (
            dump &&
            dump.executions.length > 0 &&
            dump.executions[0].tasks.length > 0
          ) {
            get().setActiveTask(dump.executions[0].tasks[0]);
          }
        };

        const allScriptsInfo = allScriptsFromDump(dump);

        if (!allScriptsInfo) {
          return setDefaultActiveTask();
        }

        const { scripts: allScripts, width, height } = allScriptsInfo;

        set({
          allExecutionAnimation: allScripts,
          _executionDumpLoadId: ++_executionDumpLoadId,
          replayAllMode: true,
          insightWidth: width,
          insightHeight: height,
        });
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
            ? generateAnimationScripts(parentExecution, width, height)
            : null,
      });
      console.log('will set task', task);
      if (task.type === 'Insight') {
        const dump = (task as ExecutionTaskInsightLocate).log?.dump!;
        set({
          insightDump: dump,
          _insightDumpLoadId: ++state._insightDumpLoadId,
        });
      } else {
        set({ insightDump: null });
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
