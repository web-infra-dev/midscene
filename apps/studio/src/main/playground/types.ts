import type { AndroidPlaygroundBootstrap } from '@shared/electron-contract';

export interface AndroidPlaygroundPackagePaths {
  packageRoot: string;
  staticDir: string;
}

export interface AndroidPlaygroundRuntimeService {
  close: () => Promise<void>;
  getBootstrap: () => AndroidPlaygroundBootstrap;
  restart: () => Promise<AndroidPlaygroundBootstrap>;
  start: () => Promise<AndroidPlaygroundBootstrap>;
}
