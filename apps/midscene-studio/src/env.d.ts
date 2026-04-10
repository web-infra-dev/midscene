import type { ElectronShellApi } from './shared/electron-contract';

declare global {
  interface Window {
    electronShell?: ElectronShellApi;
  }
}

declare const __APP_VERSION__: string;
