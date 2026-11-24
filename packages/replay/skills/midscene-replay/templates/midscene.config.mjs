import { webFileSetup } from '@midscene/replay/web-setup';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightBrowserAgent } from '@midscene/web/playwright/agent';

export default {
  fileSetup: webFileSetup({
    url:
      process.env.REPLAY_START_URL ??
      'https://todomvc.com/examples/react/dist/',
    // For login: cdp: 'http://127.0.0.1:9222', mode: 'cdp-state' or 'cdp-tab'.
    headless: false,
  }),
  nodes: createMidsceneNodes({
    agentClass: PlaywrightBrowserAgent,
    getAgent: ({ context }) => context.agent,
  }),
  test: { replay: 'auto' },
};
