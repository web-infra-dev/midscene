import * as Z from 'zustand';

const { create } = Z;

const AUTO_ZOOM_KEY = 'midscene-auto-zoom';
const BACKGROUND_VISIBLE_KEY = 'midscene-background-visible';
const ELEMENTS_VISIBLE_KEY = 'midscene-elements-visible';

const parseBooleanParam = (value: string | null): boolean | undefined => {
  if (value === null) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
};

const getQueryPreference = (paramName: string): boolean | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const searchParams = new URLSearchParams(window.location.search);
  return parseBooleanParam(searchParams.get(paramName));
};

export const useBlackboardPreference = create<{
  backgroundVisible: boolean;
  elementsVisible: boolean;
  autoZoom: boolean;
  setBackgroundVisible: (visible: boolean) => void;
  setElementsVisible: (visible: boolean) => void;
  setAutoZoom: (enabled: boolean) => void;
}>((set) => {
  const savedAutoZoom = localStorage.getItem(AUTO_ZOOM_KEY) !== 'false';
  const savedBackgroundVisible =
    localStorage.getItem(BACKGROUND_VISIBLE_KEY) !== 'false';
  const savedElementsVisible =
    localStorage.getItem(ELEMENTS_VISIBLE_KEY) !== 'false';
  const autoZoomFromQuery = getQueryPreference('focusOnCursor');
  const elementsVisibleFromQuery = getQueryPreference('showElementMarkers');
  return {
    backgroundVisible: savedBackgroundVisible,
    elementsVisible:
      elementsVisibleFromQuery === undefined
        ? savedElementsVisible
        : elementsVisibleFromQuery,
    autoZoom:
      autoZoomFromQuery === undefined ? savedAutoZoom : autoZoomFromQuery,
    setBackgroundVisible: (visible: boolean) => {
      set({ backgroundVisible: visible });
      localStorage.setItem(BACKGROUND_VISIBLE_KEY, visible.toString());
    },
    setElementsVisible: (visible: boolean) => {
      set({ elementsVisible: visible });
      localStorage.setItem(ELEMENTS_VISIBLE_KEY, visible.toString());
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
const SCREENSHOT_INCLUDED_KEY = 'midscene-screenshot-included';
const DOM_INCLUDED_KEY = 'midscene-dom-included';
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
  screenshotIncluded: boolean;
  setScreenshotIncluded: (screenshotIncluded: boolean) => void;
  domIncluded: boolean | 'visible-only';
  setDomIncluded: (domIncluded: boolean | 'visible-only') => void;
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
  const savedScreenshotIncluded =
    localStorage.getItem(SCREENSHOT_INCLUDED_KEY) !== 'false';
  const savedDomIncluded = localStorage.getItem(DOM_INCLUDED_KEY) || 'false';
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
    screenshotIncluded: savedScreenshotIncluded,
    setScreenshotIncluded: (screenshotIncluded: boolean) => {
      set({ screenshotIncluded });
      localStorage.setItem(
        SCREENSHOT_INCLUDED_KEY,
        screenshotIncluded.toString(),
      );
    },
    domIncluded:
      savedDomIncluded === 'visible-only'
        ? 'visible-only'
        : savedDomIncluded === 'true',
    setDomIncluded: (domIncluded: boolean | 'visible-only') => {
      set({ domIncluded });
      localStorage.setItem(DOM_INCLUDED_KEY, domIncluded.toString());
    },
    popupTab: 'playground',
    setPopupTab: (tab: 'playground' | 'bridge' | 'recorder') => {
      set({ popupTab: tab });
    },
  };
});
