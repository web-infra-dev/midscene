import * as Z from 'zustand';
// import { createStore } from 'zustand/vanilla';
import type {
  BaseElement,
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskInsightLocate,
  GroupedActionDump,
  InsightDump,
} from '../../../midscene/dist/types';
import type { AnimationScript } from './replay-scripts';
import { generateAnimationScripts } from './replay-scripts';

const { create } = Z;
export const useBlackboardPreference = create<{
  bgVisible: boolean;
  elementsVisible: boolean;
  setBgVisible: (visible: boolean) => void;
  setTextsVisible: (visible: boolean) => void;
}>((set) => ({
  bgVisible: true,
  elementsVisible: true,
  setBgVisible: (visible: boolean) => {
    set({ bgVisible: visible });
  },
  setTextsVisible: (visible: boolean) => {
    set({ elementsVisible: visible });
  },
}));

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
    // TODO: get from dump
    hoverTask: null,
    hoverTimestamp: null,
    hoverPreviewConfig: null,
  };

  const syncToInsightDump = (dump: InsightDump) => {
    const { loadData } = useInsightDump.getState();
    loadData(dump);
  };

  const resetInsightDump = () => {
    const { reset } = useInsightDump.getState();
    reset();
  };

  const resetActiveExecution = () => {
    set({
      activeExecution: null,
      activeExecutionAnimation: null,
      _executionDumpLoadId: ++_executionDumpLoadId,
    });

    resetInsightDump();
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
      resetInsightDump();

      // set the first task as selected
      // if (
      //   dump &&
      //   dump.executions.length > 0 &&
      //   dump.executions[0].tasks.length > 0
      // ) {
      //   get().setActiveTask(dump.executions[0].tasks[0]);
      // }

      if (dump && dump.executions.length > 0) {
        // find out the width and height of the screenshot
        let width = 0;
        let height = 0;

        dump.executions.forEach((execution) => {
          execution.tasks.forEach((task) => {
            if (task.type === 'Insight') {
              const insightTask = task as ExecutionTaskInsightLocate;
              if (insightTask.log?.dump?.context?.size?.width) {
                width = insightTask.log?.dump?.context?.size?.width;
                height = insightTask.log?.dump?.context?.size?.height;
              }
            }
          });
        });

        if (!width || !height) {
          console.warn(
            'width or height not found, failed to generate animation',
          );
          return;
        }

        const allScripts: AnimationScript[] = [];
        dump.executions.forEach((execution) => {
          const scripts = generateAnimationScripts(execution, width, height);
          if (scripts) {
            allScripts.push(...scripts);
          }
        });
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
        syncToInsightDump((task as ExecutionTaskInsightLocate).log?.dump!);
      } else {
        resetInsightDump();
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
      resetInsightDump();
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

export const useInsightDump = create<{
  _loadId: number;
  data: InsightDump | null;
  highlightSectionNames: string[];
  setHighlightSectionNames: (sections: string[]) => void;
  highlightElements: BaseElement[];
  setHighlightElements: (elements: BaseElement[]) => void;
  loadData: (data: InsightDump) => void;
  reset: () => void;
}>((set) => {
  let loadId = 0;
  const initData = {
    _loadId: 0,
    highlightSectionNames: [],
    highlightElements: [],
    data: null,
  };

  return {
    ...initData,
    loadData: (data: InsightDump) => {
      // console.log('will load dump data');
      // console.log(data);
      set({
        _loadId: ++loadId,
        data,
        highlightSectionNames: [],
        highlightElements: [],
      });
    },
    setHighlightSectionNames: (sections: string[]) => {
      set({ highlightSectionNames: sections });
    },
    setHighlightElements: (elements: BaseElement[]) => {
      set({ highlightElements: elements });
    },
    reset: () => {
      set(initData);
    },
  };
});
