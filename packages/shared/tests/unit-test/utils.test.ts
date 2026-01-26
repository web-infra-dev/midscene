import { describe, expect, it } from 'vitest';
import {
  mergeAndNormalizeAppNameMapping,
  normalizeForComparison,
  replaceIllegalPathCharsAndSpace,
} from '../../src/utils';

describe('replaceIllegalPathCharsAndSpace', () => {
  it('should preserve Unix path separators', () => {
    const input = '/path/to/file.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/path/to/file.txt');
  });

  it('should preserve Windows backslash separators but replace colon', () => {
    const input = 'C:\\Users\\Documents\\file.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('C-\\Users\\Documents\\file.txt');
  });

  it('should replace illegal filename characters with dashes', () => {
    const input = 'file:name*with?illegal"chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('file-name-with-illegal-chars---.txt');
  });

  it('should replace spaces with dashes', () => {
    const input = 'file name with spaces.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('file-name-with-spaces.txt');
  });

  it('should handle mixed path and illegal characters', () => {
    const input = '/path/to/file:with*illegal?chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/path/to/file-with-illegal-chars---.txt');
  });

  it('should handle Windows path with illegal characters', () => {
    const input = 'C:\\Users\\Documents\\file:name*with?illegal"chars<>|.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe(
      'C-\\Users\\Documents\\file-name-with-illegal-chars---.txt',
    );
  });

  it('should handle empty string', () => {
    const input = '';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('');
  });

  it('should handle string with only illegal characters', () => {
    const input = ':*?"<>| ';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('--------');
  });

  it('should handle string with only path separators', () => {
    const input = '/\\//\\';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('/\\//\\');
  });

  it('should handle complex real-world scenario', () => {
    const input =
      '/Users/test/Documents/My Project: "Important File" <2024>|backup*.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe(
      '/Users/test/Documents/My-Project---Important-File---2024--backup-.txt',
    );
  });

  it('should handle task title with illegal characters', () => {
    const input = 'Task: "Test File" <Important>|Special*';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('Task---Test-File---Important--Special-');
  });

  it('should handle cache ID with mixed characters', () => {
    const input = 'cache-id:with*special?chars"and<spaces>|';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('cache-id-with-special-chars-and-spaces--');
  });

  it('should replace hash symbol # with dash', () => {
    const input = 'file#with#hash#symbols.txt';
    const result = replaceIllegalPathCharsAndSpace(input);
    expect(result).toBe('file-with-hash-symbols.txt');
  });
});

describe('normalizeForComparison', () => {
  it('should convert to lowercase', () => {
    expect(normalizeForComparison('MockApp')).toBe('mockapp');
    expect(normalizeForComparison('MOCKAPP')).toBe('mockapp');
    expect(normalizeForComparison('mockapp')).toBe('mockapp');
  });

  it('should remove spaces', () => {
    expect(normalizeForComparison('Mock App')).toBe('mockapp');
    expect(normalizeForComparison('mock app')).toBe('mockapp');
    expect(normalizeForComparison('Mock  App')).toBe('mockapp');
  });

  it('should handle multiple spaces', () => {
    expect(normalizeForComparison('Mock   App   Name')).toBe('mockappname');
    expect(normalizeForComparison('  Mock App  ')).toBe('mockapp');
  });

  it('should handle tabs and newlines', () => {
    expect(normalizeForComparison('Mock\tApp')).toBe('mockapp');
    expect(normalizeForComparison('Mock\nApp')).toBe('mockapp');
  });

  it('should match different variations of the same app name', () => {
    const mappingKey = 'Mock App';
    const normalizedKey = normalizeForComparison(mappingKey);

    // All these user inputs should match the mapping key
    const userInputs = [
      'mockapp',
      'MockApp',
      'MOCKAPP',
      'Mock App',
      'mock app',
      'MOCK APP',
      'Mock  App',
      '  MockApp  ',
    ];

    for (const input of userInputs) {
      expect(normalizeForComparison(input)).toBe(normalizedKey);
    }
  });

  it('should remove dashes', () => {
    expect(normalizeForComparison('Mock-App')).toBe('mockapp');
    expect(normalizeForComparison('mock-app')).toBe('mockapp');
    expect(normalizeForComparison('Google-Calendar')).toBe('googlecalendar');
    expect(normalizeForComparison('Google-Play-Store')).toBe('googleplaystore');
  });

  it('should remove underscores', () => {
    expect(normalizeForComparison('Mock_App')).toBe('mockapp');
    expect(normalizeForComparison('mock_app')).toBe('mockapp');
    expect(normalizeForComparison('Google_Calendar')).toBe('googlecalendar');
    expect(normalizeForComparison('Google_Play_Store')).toBe('googleplaystore');
  });

  it('should handle mixed separators', () => {
    expect(normalizeForComparison('Mock-App_Name')).toBe('mockappname');
    expect(normalizeForComparison('Mock_App-Name')).toBe('mockappname');
    expect(normalizeForComparison('Mock App-Name_Test')).toBe(
      'mockappnametest',
    );
    expect(normalizeForComparison('Google-Calendar_App')).toBe(
      'googlecalendarapp',
    );
  });

  it('should match app names with different separator variations', () => {
    // All these should normalize to the same value
    const variations = [
      'Google Calendar',
      'Google-Calendar',
      'Google_Calendar',
      'google calendar',
      'google-calendar',
      'google_calendar',
      'GoogleCalendar',
      'googlecalendar',
      'GOOGLE CALENDAR',
      'GOOGLE-CALENDAR',
      'GOOGLE_CALENDAR',
    ];

    const normalizedValues = variations.map(normalizeForComparison);
    const expected = 'googlecalendar';

    for (const normalized of normalizedValues) {
      expect(normalized).toBe(expected);
    }
  });

  it('should handle consecutive separators', () => {
    expect(normalizeForComparison('Mock--App')).toBe('mockapp');
    expect(normalizeForComparison('Mock__App')).toBe('mockapp');
    expect(normalizeForComparison('Mock--_-App')).toBe('mockapp');
    expect(normalizeForComparison('Mock  -  App')).toBe('mockapp');
  });
});

describe('mergeAndNormalizeAppNameMapping', () => {
  it('should normalize mapping keys with later entries winning', () => {
    const mapping = {
      'Google Calendar': 'com.google.android.calendar',
      'Google-Calendar': 'com.google.android.calendar.v2',
    };

    const normalized = mergeAndNormalizeAppNameMapping(mapping);

    // Only one key should exist (the later one wins)
    expect(Object.keys(normalized)).toHaveLength(1);
    expect(normalized.googlecalendar).toBe('com.google.android.calendar.v2');
  });

  it('should handle mixed case and separators', () => {
    const mapping = {
      'Google Play Store': 'com.android.vending',
      GooglePlayStore: 'com.android.vending.alt',
      'google-play-store': 'com.android.vending.final',
    };

    const normalized = mergeAndNormalizeAppNameMapping(mapping);

    expect(Object.keys(normalized)).toHaveLength(1);
    expect(normalized.googleplaystore).toBe('com.android.vending.final');
  });

  it('should preserve unique entries', () => {
    const mapping = {
      Chrome: 'com.android.chrome',
      Firefox: 'org.mozilla.firefox',
      Safari: 'com.apple.safari',
    };

    const normalized = mergeAndNormalizeAppNameMapping(mapping);

    expect(Object.keys(normalized)).toHaveLength(3);
    expect(normalized.chrome).toBe('com.android.chrome');
    expect(normalized.firefox).toBe('org.mozilla.firefox');
    expect(normalized.safari).toBe('com.apple.safari');
  });

  it('should handle empty mapping', () => {
    const normalized = mergeAndNormalizeAppNameMapping({});
    expect(normalized).toEqual({});
  });

  it('should merge user mapping over default with normalized keys', () => {
    const defaultMapping = {
      'Google Calendar': 'com.google.android.calendar',
      Chrome: 'com.android.chrome',
    };

    const userMapping = {
      'google-calendar': 'com.custom.calendar',
    };

    const merged = mergeAndNormalizeAppNameMapping(defaultMapping, userMapping);

    expect(merged.googlecalendar).toBe('com.custom.calendar');
    expect(merged.chrome).toBe('com.android.chrome');
  });

  it('should handle undefined user mapping', () => {
    const defaultMapping = {
      Chrome: 'com.android.chrome',
    };

    const result = mergeAndNormalizeAppNameMapping(defaultMapping, undefined);

    expect(result.chrome).toBe('com.android.chrome');
  });

  it('should allow user to override with different separator style', () => {
    const defaultMapping = {
      'Google Calendar': 'com.google.android.calendar',
      'Google Drive': 'com.google.android.apps.docs',
    };

    const userMapping = {
      google_calendar: 'com.custom.calendar',
    };

    const merged = mergeAndNormalizeAppNameMapping(defaultMapping, userMapping);

    expect(merged.googlecalendar).toBe('com.custom.calendar');
    expect(merged.googledrive).toBe('com.google.android.apps.docs');
  });
});
