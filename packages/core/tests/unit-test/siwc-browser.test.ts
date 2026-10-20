import {
  SIWC_AUTH_STORAGE_KEY,
  readSiwcAccessToken,
} from '@/ai-model/service-caller/openai/siwc';
import { afterEach, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/shared/utils', () => ({ ifInBrowser: true }));

afterEach(() => rs.unstubAllGlobals());

it('reads Chrome extension storage in a browser without Node.js APIs', async () => {
  rs.stubGlobal('chrome', {
    runtime: { id: 'midscene-extension' },
    storage: {
      local: {
        get: async () => ({
          [SIWC_AUTH_STORAGE_KEY]: {
            credentials: { access_token: 'extension-token' },
          },
        }),
      },
    },
  });
  expect(await readSiwcAccessToken()).toBe('extension-token');
});

it.each([undefined, {}, { runtime: {} }])(
  'reports unsupported ordinary browser environments',
  async (chrome) => {
    rs.stubGlobal('chrome', chrome);
    await expect(readSiwcAccessToken()).rejects.toThrow(
      'Node.js or the Midscene Chrome extension',
    );
  },
);
