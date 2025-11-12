/**
 * Utilities for Remote Browser tests
 */

import type { RemoteBrowserOptions } from '@/remote-browser';
import { launchRemoteBrowser as createRemoteBrowser } from '@/remote-browser';

/**
 * Launch a Remote Browser agent for testing
 */
export async function launchRemoteBrowser(
  options: Partial<RemoteBrowserOptions> = {},
) {
  const agent = await createRemoteBrowser({
    environment: 'CN', // Default to CN environment
    engine: 'puppeteer', // Default to Puppeteer
    ttlMinutes: 30, // 30 minutes for tests
    autoCleanup: true, // Auto cleanup
    ...options,
  });

  const remotePage = agent.getRemotePage();
  const webPage = remotePage.getWebPage();

  return {
    agent,
    // Return underlying page for navigation (page.goto, etc.)
    page: webPage.underlyingPage,
    // Also return webPage for advanced use
    webPage,
    remotePage,
    sandboxId: agent.getSandboxId(),
    vncUrl: agent.getVncUrl(),
    reset: async () => {
      await agent.cleanup();
    },
  };
}

/**
 * Helper to get VNC URL for debugging
 */
export function logVncUrl(vncUrl: string) {
  console.log('\n🖥️  VNC URL for debugging:');
  console.log(`   ${vncUrl}\n`);
}
