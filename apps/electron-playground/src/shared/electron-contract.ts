export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeSnapshot {
  source: ThemePreference;
  resolved: ResolvedTheme;
}

export const IPC_CHANNELS = {
  closeWindow: 'shell:close-window',
  getThemeSnapshot: 'shell:get-theme-snapshot',
  minimizeWindow: 'shell:minimize-window',
  themeChanged: 'shell:theme-changed',
  toggleMaximizeWindow: 'shell:toggle-maximize-window',
  updateThemeSource: 'shell:update-theme-source',
} as const;

export interface ElectronShellApi {
  closeWindow: () => Promise<void>;
  getPlatform: () => NodeJS.Platform;
  getThemeSnapshot: () => Promise<ThemeSnapshot>;
  minimizeWindow: () => Promise<void>;
  onThemeChanged: (listener: (snapshot: ThemeSnapshot) => void) => () => void;
  toggleMaximizeWindow: () => Promise<void>;
  updateThemeSource: (source: ThemePreference) => Promise<ThemeSnapshot>;
}
