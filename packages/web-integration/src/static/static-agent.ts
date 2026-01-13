import type { AgentOpt } from '@midscene/core';
import { Agent as PageAgent } from '@midscene/core/agent';
import { MemoryStorage } from '@midscene/core/storage';

import type StaticPage from './static-page';

/**
 * StaticPageAgent for running AI queries on static screenshots.
 * Works in both browser and Node.js environments.
 *
 * In browser: Uses MemoryStorage (default)
 * In Node.js: Uses FileStorage if available, falls back to MemoryStorage
 */
export class StaticPageAgent extends PageAgent {
  constructor(page: StaticPage, opts?: AgentOpt) {
    // Use MemoryStorage by default (browser-safe)
    // Node.js callers can pass FileStorage via opts.storageProvider if needed
    const storageProvider = opts?.storageProvider ?? new MemoryStorage();
    super(page, { ...opts, storageProvider });
    this.dryMode = true;
  }
}
