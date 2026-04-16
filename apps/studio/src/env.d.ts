import type {
  ElectronShellApi,
  StudioRuntimeApi,
} from './shared/electron-contract';

declare global {
  interface Window {
    electronShell?: ElectronShellApi;
    studioRuntime?: StudioRuntimeApi;
  }
}

declare const __APP_VERSION__: string;
