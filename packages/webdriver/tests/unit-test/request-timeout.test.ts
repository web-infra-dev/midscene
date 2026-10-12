import { createServer } from 'node:http';
import { describe, expect, it } from '@rstest/core';
import { makeWebDriverRequest } from '../../src/utils/request';

describe('WebDriver response timeout', () => {
  it.each(['application/json', 'text/plain'])(
    'keeps the deadline active while reading a %s body',
    async (contentType) => {
      const server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': contentType });
        res.write(contentType === 'application/json' ? '{"value":' : 'pending');
        // Complete eventually so the old implementation fails rather than hangs.
        const timer = setTimeout(
          () => res.end(contentType === 'application/json' ? 'true}' : 'done'),
          250,
        );
        res.on('close', () => clearTimeout(timer));
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      try {
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('No listening port');
        await expect(
          makeWebDriverRequest(
            `http://127.0.0.1:${address.port}`,
            'GET',
            '/element/active',
            undefined,
            80,
          ),
        ).rejects.toThrow('timeout after 80ms');
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});
