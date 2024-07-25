import { create } from 'zustand';
import {
  InsightDump,
  BaseElement,
  ExecutionTaskInsightLocate,
  ExecutionTask,
  GroupedActionDump,
} from '../../../midscene/dist/types';

export const useBlackboardPreference = create<{
  bgVisible: boolean;
  textsVisible: boolean;
  setBgVisible: (visible: boolean) => void;
  setTextsVisible: (visible: boolean) => void;
}>((set) => ({
  bgVisible: false,
  textsVisible: true,
  setBgVisible: (visible: boolean) => {
    set({ bgVisible: visible });
  },
  setTextsVisible: (visible: boolean) => {
    set({ textsVisible: visible });
  },
}));

export const useExecutionDump = create<{
  dump: GroupedActionDump[] | null;
  setGroupedDump: (dump: GroupedActionDump[]) => void;
  activeTask: ExecutionTask | null;
  setActiveTask: (task: ExecutionTask) => void;
  hoverTask: ExecutionTask | null;
  setHoverTask: (task: ExecutionTask | null) => void;
  hoverPreviewConfig: { x: number; y: number } | null;
  setHoverPreviewConfig: (config: { x: number; y: number } | null) => void;
  reset: () => void;
}>((set) => {
  const initData = {
    dump: null,
    activeTask: null,
    hoverTask: null,
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

  return {
    ...initData,
    setGroupedDump: (dump: GroupedActionDump[]) => {
      console.log('will set ExecutionDump', dump);
      set({
        dump,
      });

      // set the first one as selected
      for (const item of dump) {
        if (item.executions.length > 0 && item.executions[0].tasks.length > 0) {
          set({ activeTask: item.executions[0].tasks[0] });
          break;
        }
      }
    },
    setActiveTask(task: ExecutionTask) {
      set({ activeTask: task });
      if ((task as ExecutionTaskInsightLocate).log?.dump?.matchedElement) {
        syncToInsightDump((task as ExecutionTaskInsightLocate).log!.dump!);
      } else {
        resetInsightDump();
      }
    },
    setHoverTask(task: ExecutionTask | null) {
      set({ hoverTask: task });
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
  const groupedDumps = useExecutionDump((store) => store.dump);

  const allTasks =
    groupedDumps?.reduce<ExecutionTask[]>((acc, group) => {
      const tasksInside = group.executions.reduce<ExecutionTask[]>(
        (acc2, execution) => acc2.concat(execution.tasks),
        [],
      );

      return acc.concat(tasksInside);
    }, []) || [];

  return allTasks;
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
  const initData = { _loadId: 0, highlightSectionNames: [], highlightElements: [], data: null };

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
