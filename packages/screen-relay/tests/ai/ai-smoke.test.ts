import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  MIDSCENE_SCREEN_RELAY_TOKEN,
  MIDSCENE_SCREEN_RELAY_URL,
  agentForScreenRelay,
} from '../../src';
import {
  type RunningDesktopFixture,
  startDesktopFixture,
} from './fixture-harness';

rs.setConfig({
  testTimeout: 180 * 1000,
});

describe('screen-relay AI vision end-to-end', () => {
  let fixture: RunningDesktopFixture | undefined;

  afterEach(async () => {
    await fixture?.stop();
    fixture = undefined;
  });

  it('controls a live desktop through agentForScreenRelay using vision models', async () => {
    const url = process.env[MIDSCENE_SCREEN_RELAY_URL];
    if (!url) {
      throw new Error(
        `Set ${MIDSCENE_SCREEN_RELAY_URL} to run screen-relay AI tests.`,
      );
    }

    const agent = await agentForScreenRelay({
      url,
      token: process.env[MIDSCENE_SCREEN_RELAY_TOKEN],
      generateReport: true,
      reportFileName: 'screen-relay-ai-smoke',
      aiContexts: {
        aiAct:
          'You are controlling a fullscreen desktop test page with labeled boxes.',
      },
    });

    try {
      const size = await agent.interface.size();
      fixture = await startDesktopFixture(size);

      await agent.aiInput('北京天气', 'the text input box at the top left');
      await agent.aiKeyboardPress('Enter');

      await agent.aiAct(
        'Drag the cyan box labeled "DRAG SOURCE" onto the red box labeled "DROP TARGET"',
      );

      await agent.aiAssert(
        'The badge at the top right shows "ENTER:北京天气" and the right box shows "DROPPED"',
      );

      expect(
        fixture.events.some(
          (e) => e.type === 'enter' && e.value === '北京天气',
        ),
      ).toBe(true);
      expect(fixture.events.some((e) => e.type === 'dropped')).toBe(true);
      expect(fixture.events.some((e) => e.type === 'drag-lost-button')).toBe(
        false,
      );
      expect(agent.metrics.calls).toBeGreaterThan(0);
    } finally {
      await agent.destroy();
    }
  });
});
