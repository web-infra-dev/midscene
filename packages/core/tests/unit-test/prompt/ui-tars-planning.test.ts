import {
  getLanguage,
  getTimeZoneInfo,
} from '@/ai-model/prompt/ui-tars-planning';
import { afterEach, describe, expect, it } from 'vitest';
import { mockNonChinaTimeZone, restoreIntl } from '../mocks/intl-mock';

describe('UI TARS Planning Functions', () => {
  afterEach(() => {
    restoreIntl();
  });

  it('getTimeZoneInfo returns original timezone without mock', () => {
    // This test will vary based on the system running it
    const info = getTimeZoneInfo();
    // We don't assert on specific values here as they depend on the local environment
    expect(info).toHaveProperty('timezone');
    expect(info).toHaveProperty('isChina');
    expect(typeof info.timezone).toBe('string');
    expect(typeof info.isChina).toBe('boolean');
  });

  it('getTimeZoneInfo returns non-China timezone with mock', () => {
    mockNonChinaTimeZone();

    const info = getTimeZoneInfo();
    expect(info.isChina).toBe(false);

    const language = getLanguage();
    expect(language).toBe('English');
  });
});
