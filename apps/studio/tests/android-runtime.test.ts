import { describe, expect, it } from 'vitest';
import {
  createStudioCorsOptions,
  isAllowedStudioOrigin,
} from '../src/main/playground/cors';

describe('android runtime CORS policy', () => {
  it('allows Studio origins used by Electron and local renderer dev', () => {
    expect(isAllowedStudioOrigin(undefined)).toBe(true);
    expect(isAllowedStudioOrigin('null')).toBe(true);
    expect(isAllowedStudioOrigin('file://')).toBe(true);
    expect(isAllowedStudioOrigin('http://127.0.0.1:3210')).toBe(true);
    expect(isAllowedStudioOrigin('http://localhost:3210')).toBe(true);
  });

  it('rejects non-loopback browser origins', () => {
    expect(isAllowedStudioOrigin('https://midscenejs.com')).toBe(false);
    expect(isAllowedStudioOrigin('http://192.168.1.10:3210')).toBe(false);
    expect(isAllowedStudioOrigin('not-a-url')).toBe(false);
  });

  it('builds matching cors options', () => {
    const corsOptions = createStudioCorsOptions();
    const originResolver = corsOptions.origin;

    let allowedResult: boolean | undefined;
    originResolver('http://127.0.0.1:3210', (error, allowed) => {
      expect(error).toBeNull();
      allowedResult = allowed;
    });

    let blockedResult: boolean | undefined;
    originResolver('https://midscenejs.com', (error, allowed) => {
      expect(error).toBeNull();
      blockedResult = allowed;
    });

    expect(allowedResult).toBe(true);
    expect(blockedResult).toBe(false);
    expect(corsOptions.credentials).toBe(true);
  });
});
