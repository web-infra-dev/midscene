import * as Z from 'zustand';

const { create } = Z;

const AUTO_ZOOM_KEY = 'midscene-auto-zoom';
const BACKGROUND_VISIBLE_KEY = 'midscene-background-visible';
const ELEMENTS_VISIBLE_KEY = 'midscene-elements-visible';
const MODEL_CALL_DETAILS_KEY = 'midscene-model-call-details';
const DARK_MODE_KEY = 'midscene-dark-mode';

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

export const useGlobalPreference = create<{
  backgroundVisible: boolean;
  elementsVisible: boolean;
  autoZoom: boolean;
  modelCallDetailsEnabled: boolean;
  darkModeEnabled: boolean;
  setBackgroundVisible: (visible: boolean) => void;
  setElementsVisible: (visible: boolean) => void;
  setAutoZoom: (enabled: boolean) => void;
  setModelCallDetailsEnabled: (enabled: boolean) => void;
  setDarkModeEnabled: (enabled: boolean) => void;
}>((set) => {
  const savedAutoZoom = localStorage.getItem(AUTO_ZOOM_KEY) !== 'false';
  const savedBackgroundVisible =
    localStorage.getItem(BACKGROUND_VISIBLE_KEY) !== 'false';
  const savedElementsVisible =
    localStorage.getItem(ELEMENTS_VISIBLE_KEY) !== 'false';
  const savedModelCallDetails =
    localStorage.getItem(MODEL_CALL_DETAILS_KEY) === 'true';
  const savedDarkMode = localStorage.getItem(DARK_MODE_KEY) === 'true';
  const autoZoomFromQuery = getQueryPreference('focusOnCursor');
  const elementsVisibleFromQuery = getQueryPreference('showElementMarkers');
  const darkModeFromQuery = getQueryPreference('darkMode');
  const initialDarkMode =
    darkModeFromQuery === undefined ? savedDarkMode : darkModeFromQuery;

  if (darkModeFromQuery !== undefined) {
    localStorage.setItem(DARK_MODE_KEY, initialDarkMode.toString());
  }
  return {
    backgroundVisible: savedBackgroundVisible,
    elementsVisible:
      elementsVisibleFromQuery === undefined
        ? savedElementsVisible
        : elementsVisibleFromQuery,
    autoZoom:
      autoZoomFromQuery === undefined ? savedAutoZoom : autoZoomFromQuery,
    modelCallDetailsEnabled: savedModelCallDetails,
    darkModeEnabled: initialDarkMode,
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
    setModelCallDetailsEnabled: (enabled: boolean) => {
      set({ modelCallDetailsEnabled: enabled });
      localStorage.setItem(MODEL_CALL_DETAILS_KEY, enabled.toString());
    },
    setDarkModeEnabled: (enabled: boolean) => {
      set({ darkModeEnabled: enabled });
      localStorage.setItem(DARK_MODE_KEY, enabled.toString());
    },
  };
});

const CONFIG_KEY = 'midscene-env-config';
const SERVICE_MODE_KEY = 'midscene-service-mode';
const TRACKING_ACTIVE_TAB_KEY = 'midscene-tracking-active-tab';
const DEEP_THINK_KEY = 'midscene-deep-think';
const SCREENSHOT_INCLUDED_KEY = 'midscene-screenshot-included';
const DOM_INCLUDED_KEY = 'midscene-dom-included';

// Device-specific configuration keys
const IME_STRATEGY_KEY = 'midscene-ime-strategy';
const AUTO_DISMISS_KEYBOARD_KEY = 'midscene-auto-dismiss-keyboard';
const KEYBOARD_DISMISS_STRATEGY_KEY = 'midscene-keyboard-dismiss-strategy';
const ALWAYS_REFRESH_SCREEN_INFO_KEY = 'midscene-always-refresh-screen-info';
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
export type ImeStrategyType = 'always-yadb' | 'yadb-for-non-ascii';
export type KeyboardDismissStrategyType = 'esc-first' | 'back-first';

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
  // Device-specific configuration options
  imeStrategy: ImeStrategyType;
  setImeStrategy: (imeStrategy: ImeStrategyType) => void;
  autoDismissKeyboard: boolean;
  setAutoDismissKeyboard: (autoDismissKeyboard: boolean) => void;
  keyboardDismissStrategy: KeyboardDismissStrategyType;
  setKeyboardDismissStrategy: (
    keyboardDismissStrategy: KeyboardDismissStrategyType,
  ) => void;
  alwaysRefreshScreenInfo: boolean;
  setAlwaysRefreshScreenInfo: (alwaysRefreshScreenInfo: boolean) => void;
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

  // Load device-specific configuration from localStorage
  const savedImeStrategy =
    (localStorage.getItem(IME_STRATEGY_KEY) as ImeStrategyType) ||
    'yadb-for-non-ascii';
  const savedAutoDismissKeyboard =
    localStorage.getItem(AUTO_DISMISS_KEYBOARD_KEY) !== 'false'; // default true
  const savedKeyboardDismissStrategy =
    (localStorage.getItem(
      KEYBOARD_DISMISS_STRATEGY_KEY,
    ) as KeyboardDismissStrategyType) || 'esc-first';
  const savedAlwaysRefreshScreenInfo =
    localStorage.getItem(ALWAYS_REFRESH_SCREEN_INFO_KEY) === 'true'; // default false
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
    // Device-specific configuration options
    imeStrategy: savedImeStrategy,
    setImeStrategy: (imeStrategy: ImeStrategyType) => {
      set({ imeStrategy });
      localStorage.setItem(IME_STRATEGY_KEY, imeStrategy);
    },
    autoDismissKeyboard: savedAutoDismissKeyboard,
    setAutoDismissKeyboard: (autoDismissKeyboard: boolean) => {
      set({ autoDismissKeyboard });
      localStorage.setItem(
        AUTO_DISMISS_KEYBOARD_KEY,
        autoDismissKeyboard.toString(),
      );
    },
    keyboardDismissStrategy: savedKeyboardDismissStrategy,
    setKeyboardDismissStrategy: (
      keyboardDismissStrategy: KeyboardDismissStrategyType,
    ) => {
      set({ keyboardDismissStrategy });
      localStorage.setItem(
        KEYBOARD_DISMISS_STRATEGY_KEY,
        keyboardDismissStrategy,
      );
    },
    alwaysRefreshScreenInfo: savedAlwaysRefreshScreenInfo,
    setAlwaysRefreshScreenInfo: (alwaysRefreshScreenInfo: boolean) => {
      set({ alwaysRefreshScreenInfo });
      localStorage.setItem(
        ALWAYS_REFRESH_SCREEN_INFO_KEY,
        alwaysRefreshScreenInfo.toString(),
      );
    },
  };
});
