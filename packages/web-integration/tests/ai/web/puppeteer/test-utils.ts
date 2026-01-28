import path from 'node:path';
import type { PuppeteerAgent } from '@/puppeteer';
import { afterEach } from 'vitest';

/**
 * Path to fixtures directory
 */
export const FIXTURES_DIR = path.join(__dirname, '../../fixtures');

/**
 * Get the path to a fixture file
 */
export function getFixturePath(filename: string): string {
  return path.join(FIXTURES_DIR, filename);
}

/**
 * Shared test context for Puppeteer integration tests
 */
export interface TestContext {
  agent: PuppeteerAgent | null;
  resetFn: (() => Promise<void>) | null;
}

/**
 * Creates a test context with automatic cleanup
 */
export function createTestContext(): TestContext {
  const context: TestContext = {
    agent: null,
    resetFn: null,
  };

  afterEach(async () => {
    if (context.agent) {
      try {
        await context.agent.destroy();
      } catch (e) {
        console.warn('agent destroy error', e);
      }
      context.agent = null;
    }
    if (context.resetFn) {
      try {
        await context.resetFn();
      } catch (e) {
        console.warn('resetFn error');
        console.warn(e);
      }
      context.resetFn = null;
    }
  });

  return context;
}

/**
 * Default test timeout for puppeteer integration tests (4 minutes)
 */
export const DEFAULT_TEST_TIMEOUT = 4 * 60 * 1000;

/**
 * Long test timeout (15 minutes) for complex tests
 */
export const LONG_TEST_TIMEOUT = 15 * 60 * 1000;
