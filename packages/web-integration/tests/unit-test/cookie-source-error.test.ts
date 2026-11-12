import { resolveCookieInput } from '@/common/test-runner/cookies';
import { expect, it } from '@rstest/core';

it('preserves the storage-state resolver error as the cause', async () => {
  const secret = 'session=private-cookie-value';
  const result = resolveCookieInput(
    { storageStatePath: 'state.json' },
    { input: {}, context: {}, signal: new AbortController().signal },
    {
      resolveStorageStatePath: () => {
        throw new Error(secret);
      },
    },
  );
  await expect(result).rejects.toThrow(
    'Failed to read cookie storage state state.json',
  );
  await expect(result).rejects.toHaveProperty('cause.message', secret);
});
