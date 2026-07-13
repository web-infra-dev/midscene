import { describe, expect, it } from '@rstest/core';
import {
  getCreateAgentErrorNotification,
  isPuppeteerChromeMissingError,
} from '../src/controller/create-agent-error';

describe('create agent error formatting', () => {
  it('detects Puppeteer Chrome missing errors without depending on the version', () => {
    const error = new Error(
      'Could not find Chrome (ver. 999.0.0). This can occur if either\n' +
        ' 1. you did not perform an installation before running the script ' +
        '(e.g. `npx puppeteer browsers install chrome`) or\n' +
        ' 2. your cache path is incorrectly configured.',
    );

    expect(isPuppeteerChromeMissingError(error)).toBe(true);
  });

  it('detects future Puppeteer Chrome missing wording with cache context', () => {
    expect(
      isPuppeteerChromeMissingError(
        new Error(
          'Could not find Google Chrome. Check the Puppeteer cache path.',
        ),
      ),
    ).toBe(true);
  });

  it('does not classify unrelated Puppeteer errors as Chrome missing', () => {
    expect(
      isPuppeteerChromeMissingError(
        new Error('Timed out after 30000 ms while waiting for Chrome.'),
      ),
    ).toBe(false);
  });

  it('returns a persistent productized notification for Chrome missing errors', () => {
    const notification = getCreateAgentErrorNotification(
      new Error(
        'Could not find Chrome. Run `npx puppeteer browsers install chrome`.',
      ),
    );

    expect(notification).toEqual(
      expect.objectContaining({
        duration: 0,
        title: 'Failed to create Agent',
      }),
    );
    expect(notification?.description).toBeTruthy();
  });
});
