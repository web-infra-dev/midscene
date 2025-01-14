import { activeTab } from '@/extension/utils';
import { currentWindowId } from '@/extension/utils';
import * as Z from 'zustand';
// import { createStore } from 'zustand/vanilla';
import type {
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskInsightLocate,
  GroupedActionDump,
  InsightDump,
} from '../../../midscene';
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

const CONFIG_KEY = 'midscene-env-config';
const SERVICE_MODE_KEY = 'midscene-service-mode';
const HISTORY_KEY = 'midscene-prompt-history';
const TRACKING_ACTIVE_TAB_KEY = 'midscene-tracking-active-tab';
const getConfigStringFromLocalStorage = () => {
  const configString = localStorage.getItem(CONFIG_KEY);
  return configString || '';
};
const getHistoryFromLocalStorage = () => {
  const historyString = localStorage.getItem(HISTORY_KEY);
  return historyString ? JSON.parse(historyString) : [];
};
const parseConfig = (configString: string) => {
  const lines = configString.split('\n');
  const config: Record<string, string> = {};
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return;

    const cleanLine = trimmed
      .replace(/^export\s+/i, '')
      .replace(/;$/, '')
      .trim();
    const match = cleanLine.match(/^(\w+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      let parsedValue = value.trim();

      // Remove surrounding quotes if present
      if (
        (parsedValue.startsWith("'") && parsedValue.endsWith("'")) ||
        (parsedValue.startsWith('"') && parsedValue.endsWith('"'))
      ) {
        parsedValue = parsedValue.slice(1, -1);
      }

      config[key] = parsedValue;
    }
  });
  return config;
};

export interface HistoryItem {
  type: 'aiAction' | 'aiQuery' | 'aiAssert';
  prompt: string;
  timestamp: number;
}

export const useChromeTabInfo = create<{
  tabId: number | null;
  tabTitle: string | null;
  tabUrl: string | null;
  windowId: number | null;
}>((set) => {
  const data = {
    tabId: null,
    tabTitle: null,
    tabUrl: null,
    windowId: null,
  };

  Promise.resolve().then(async () => {
    const tab = await activeTab();
    const windowId = await currentWindowId();
    set({
      tabId: tab.id,
      tabTitle: tab.title,
      tabUrl: tab.url,
      windowId,
    });

    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      const tabId = activeInfo.tabId;
      const windowId = activeInfo.windowId;
      try {
        const tab = await chrome.tabs.get(tabId);
        set({ tabId, windowId, tabTitle: tab.title, tabUrl: tab.url });
      } catch (e) {
        console.error('failed to get active tab', e);
        set({ tabId: null, windowId: null, tabTitle: null, tabUrl: null });
      }
    });
  });

  return data;
});

/**
/**
 * Service Mode
 *
 * - Server: use a node server to run the code
 * - In-Browser: use browser's fetch API to run the code
 * - In-Browser-Extension: use browser's fetch API to run the code, but the page is running in the extension context
 */
export type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension'; // | 'Extension';
export const useEnvConfig = create<{
  serviceMode: ServiceModeType;
  setServiceMode: (serviceMode: ServiceModeType) => void;
  config: Record<string, string>;
  configString: string;
  setConfig: (config: Record<string, string>) => void;
  loadConfig: (configString: string) => void;
  trackingActiveTab: boolean;
  setTrackingActiveTab: (trackingActiveTab: boolean) => void;
  history: HistoryItem[];
  clearHistory: () => void;
  addHistory: (history: HistoryItem) => void;
  popupTab: 'playground' | 'bridge';
  setPopupTab: (tab: 'playground' | 'bridge') => void;
}>((set, get) => {
  const configString = getConfigStringFromLocalStorage();
  const config = parseConfig(configString);
  const ifInExtension = window.location.href.startsWith('chrome-extension');
  const savedServiceMode = localStorage.getItem(
    SERVICE_MODE_KEY,
  ) as ServiceModeType | null;
  const savedTrackingActiveTab =
    localStorage.getItem(TRACKING_ACTIVE_TAB_KEY) !== 'false';
  return {
    serviceMode: ifInExtension
      ? 'In-Browser-Extension'
      : savedServiceMode || 'Server',
    setServiceMode: (serviceMode: ServiceModeType) => {
      if (ifInExtension)
        throw new Error('serviceMode cannot be set in extension');
      set({ serviceMode });
      localStorage.setItem(SERVICE_MODE_KEY, serviceMode);
    },
    config,
    configString,
    setConfig: (config) => set({ config }),
    loadConfig: (configString: string) => {
      const config = parseConfig(configString);
      set({ config, configString });
      localStorage.setItem(CONFIG_KEY, configString);
    },
    trackingActiveTab: savedTrackingActiveTab,
    setTrackingActiveTab: (trackingActiveTab: boolean) => {
      set({ trackingActiveTab });
      localStorage.setItem(
        TRACKING_ACTIVE_TAB_KEY,
        trackingActiveTab.toString(),
      );
    },
    history: getHistoryFromLocalStorage(),
    clearHistory: () => {
      set({ history: [] });
      localStorage.removeItem(HISTORY_KEY);
    },
    addHistory: (history) => {
      const newHistory = [
        history,
        ...get().history.filter((h) => h.prompt !== history.prompt),
      ];
      while (newHistory.length > 10) {
        newHistory.pop();
      }
      set({ history: newHistory });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    },
    popupTab: 'playground',
    setPopupTab: (tab: 'playground' | 'bridge') => {
      set({ popupTab: tab });
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
  sdkVersion: string | null;
  modelName: string | null;
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
    replayAllMode: false,
    allExecutionAnimation: null,
    sdkVersion: null,
    modelName: null,
    insightWidth: null,
    insightHeight: null,
    activeTask: null,
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

        const {
          scripts: allScripts,
          width,
          height,
          modelName,
          sdkVersion,
        } = allScriptsInfo;

        set({
          allExecutionAnimation: allScripts,
          _executionDumpLoadId: ++_executionDumpLoadId,
          replayAllMode: true,
          insightWidth: width,
          insightHeight: height,
          modelName,
          sdkVersion,
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
            ? generateAnimationScripts(parentExecution, task, width, height)
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
