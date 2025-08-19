import * as Z from 'zustand';

const { create } = Z;

const AUTO_ZOOM_KEY = 'midscene-auto-zoom';

export const useBlackboardPreference = create<{
  markerVisible: boolean;
  elementsVisible: boolean;
  autoZoom: boolean;
  setMarkerVisible: (visible: boolean) => void;
  setTextsVisible: (visible: boolean) => void;
  setAutoZoom: (enabled: boolean) => void;
}>((set) => {
  const savedAutoZoom = localStorage.getItem(AUTO_ZOOM_KEY) !== 'false';
  return {
    markerVisible: true,
    elementsVisible: true,
    autoZoom: savedAutoZoom,
    setMarkerVisible: (visible: boolean) => {
      set({ markerVisible: visible });
    },
    setTextsVisible: (visible: boolean) => {
      set({ elementsVisible: visible });
    },
    setAutoZoom: (enabled: boolean) => {
      set({ autoZoom: enabled });
      localStorage.setItem(AUTO_ZOOM_KEY, enabled.toString());
    },
  };
});

const CONFIG_KEY = 'midscene-env-config';
const SERVICE_MODE_KEY = 'midscene-service-mode';
const TRACKING_ACTIVE_TAB_KEY = 'midscene-tracking-active-tab';
const DEEP_THINK_KEY = 'midscene-deep-think';
const getConfigStringFromLocalStorage = () => {
  const configString = localStorage.getItem(CONFIG_KEY);
  return configString || '';
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
  syncFromStorage: () => void;
  forceSameTabNavigation: boolean;
  setForceSameTabNavigation: (forceSameTabNavigation: boolean) => void;
  deepThink: boolean;
  setDeepThink: (deepThink: boolean) => void;
  popupTab: 'playground' | 'bridge' | 'recorder';
  setPopupTab: (tab: 'playground' | 'bridge' | 'recorder') => void;
}>((set, get) => {
  const configString = getConfigStringFromLocalStorage();
  const config = parseConfig(configString);
  const ifInExtension = window.location.href.startsWith('chrome-extension');
  const savedServiceMode = localStorage.getItem(
    SERVICE_MODE_KEY,
  ) as ServiceModeType | null;
  const savedForceSameTabNavigation =
    localStorage.getItem(TRACKING_ACTIVE_TAB_KEY) !== 'false';
  const savedDeepThink = localStorage.getItem(DEEP_THINK_KEY) === 'true';
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
    syncFromStorage: () => {
      const latestConfigString = getConfigStringFromLocalStorage();
      const latestConfig = parseConfig(latestConfigString);
      set({ config: latestConfig, configString: latestConfigString });
    },
    forceSameTabNavigation: savedForceSameTabNavigation,
    setForceSameTabNavigation: (forceSameTabNavigation: boolean) => {
      set({ forceSameTabNavigation });
      localStorage.setItem(
        TRACKING_ACTIVE_TAB_KEY,
        forceSameTabNavigation.toString(),
      );
    },
    deepThink: savedDeepThink,
    setDeepThink: (deepThink: boolean) => {
      set({ deepThink });
      localStorage.setItem(DEEP_THINK_KEY, deepThink.toString());
    },
    popupTab: 'playground',
    setPopupTab: (tab: 'playground' | 'bridge' | 'recorder') => {
      set({ popupTab: tab });
    },
  };
});
