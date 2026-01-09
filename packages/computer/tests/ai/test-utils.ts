import { sleep } from '@midscene/core/utils';
import type { ComputerAgent } from '../../src';

const IS_MAC = process.platform === 'darwin';

/**
 * Opens a browser and navigates to the specified URL
 */
export async function openBrowserAndNavigate(
  agent: ComputerAgent,
  url: string,
): Promise<void> {
  if (IS_MAC) {
    await agent.aiAct('press Cmd+Space');
    await sleep(500);
    await agent.aiAct('type "Safari" and press Enter');
    await sleep(2000);
    await agent.aiAct('press Cmd+L to focus address bar');
  } else {
    await agent.aiAct('press Windows key');
    await sleep(500);
    await agent.aiAct('type "Chrome" and press Enter');
    await sleep(2000);
    await agent.aiAct('press Ctrl+L to focus address bar');
  }
  await sleep(300);

  await agent.aiAct(`type "${url}"`);
  await agent.aiAct('press Enter');
  await sleep(3000);
}
