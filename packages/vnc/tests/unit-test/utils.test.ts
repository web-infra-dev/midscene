import { describe, expect, it } from 'vitest';
import { checkVNCConnection } from '../../src/utils';

describe('utils', () => {
  describe('checkVNCConnection', () => {
    it('should return unavailable for unreachable host', async () => {
      // Use a non-routable address with very short timeout
      const result = await checkVNCConnection('192.0.2.1', 5900, 500);
      expect(result.available).toBe(false);
      expect(result.host).toBe('192.0.2.1');
      expect(result.port).toBe(5900);
      expect(result.error).toBeDefined();
    });

    it('should return unavailable for refused connection', async () => {
      // Connect to a port that is very unlikely to be open
      const result = await checkVNCConnection('127.0.0.1', 59999, 1000);
      expect(result.available).toBe(false);
      expect(result.host).toBe('127.0.0.1');
      expect(result.port).toBe(59999);
      expect(result.error).toContain('Connection error');
    });

    it('should use default port 5900', async () => {
      const result = await checkVNCConnection('127.0.0.1');
      expect(result.port).toBe(5900);
    });
  });
});
