import { describe, expect, it } from 'vitest';

describe('Dependencies version validation', () => {
  it('should ensure uuid version in package.json is less than 13', () => {
    // Read package.json using require (should work in test environment)
    const packageJson = require('../../package.json');

    const uuidVersion = packageJson.dependencies?.uuid;

    // Ensure uuid dependency exists
    expect(uuidVersion).toBeDefined();

    // Extract major version number (first part before the dot)
    const majorVersion = Number.parseInt(uuidVersion.split('.')[0]);

    // Fail if uuid version is 13 or higher (ESM-only versions)
    expect(majorVersion).toBeLessThan(13);

    // Expected version should be 11.1.0
    expect(uuidVersion).toBe('11.1.0');
  });
});
