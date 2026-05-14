import type {
  ElectronShellApi,
  StudioRuntimeApi,
} from './shared/electron-contract';
import type { UpdaterApi } from './shared/updater-contract';

declare global {
  interface Window {
    electronShell?: ElectronShellApi;
    studioRuntime?: StudioRuntimeApi;
    studioUpdater?: UpdaterApi;
  }

  const __APP_VERSION__: string;
}
