import { getWebpackRequire } from '@/utils';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import semver from 'semver';
import {
  BROWSER_NAVIGATION_ERROR_PATTERN,
  forceChromeSelectRendering,
} from '../puppeteer/base-page';

type BrowserRuntime = 'puppeteer' | 'playwright';

const browserRuntimeConfig: Record<
  BrowserRuntime,
  {
    displayName: string;
    packageName: string;
    minimumVersion: string;
    requirementLabel: string;
  }
> = {
  puppeteer: {
    displayName: 'Puppeteer',
    packageName: 'puppeteer',
    minimumVersion: '24.6.0',
    requirementLabel: '> 24.6.0',
  },
  playwright: {
    displayName: 'Playwright',
    packageName: 'playwright',
    minimumVersion: '1.52.0',
    requirementLabel: '>= 1.52.0',
  },
};

function getPackageVersion(packageName: string): string | null {
  try {
    const pkg = getWebpackRequire()(`${packageName}/package.json`);
    return pkg.version || null;
  } catch (error) {
    console.error(
      `[midscene:error] Failed to get ${packageName} version`,
      error,
    );
    return null;
  }
}

export function isRetryableBrowserNavigationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    BROWSER_NAVIGATION_ERROR_PATTERN.test(error.message)
  );
}

export function applyForceChromeSelectRendering(
  page: PuppeteerPage | PlaywrightPage,
  runtime: BrowserRuntime,
  enabled?: boolean,
): void {
  if (!enabled) {
    return;
  }

  const config = browserRuntimeConfig[runtime];
  const version = getPackageVersion(config.packageName);
  if (version && !semver.gte(version, config.minimumVersion)) {
    console.warn(
      `[midscene:error] forceChromeSelectRendering requires ${config.displayName} ${config.requirementLabel}, but current version is ${version}. This feature may not work correctly.`,
    );
  }
  forceChromeSelectRendering(page);
}
