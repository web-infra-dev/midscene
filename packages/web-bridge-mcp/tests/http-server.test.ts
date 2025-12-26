import type { Server } from 'node:http';
import { WebMCPServer } from '@midscene/web/mcp-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('WebMCPServer HTTP mode', () => {
  let server: WebMCPServer;
  let httpServer: Server | null = null;
  const testPort = 13579; // Use a non-standard port for testing
  const testHost = '127.0.0.1'; // Use IPv4 explicitly to avoid IPv6 issues in CI

  beforeAll(async () => {
    server = new WebMCPServer();
  });

  afterAll(async () => {
    // Close the HTTP server
    if (httpServer) {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          httpServer!.close((err?: Error) => {
            if (err) reject(err);
            else resolve();
          });
        }),
        // Safety timeout to avoid hanging the hook
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  });

  it('should start HTTP server successfully and respond to requests', async () => {
    // Mock process.exit to prevent test exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    try {
      // Start server and retain instance for cleanup
      httpServer = (await server.launchHttp({
        port: testPort,
        host: testHost,
      })) as unknown as Server;

      // Simply verify the server is listening by trying to connect
      const controller = new AbortController();
      const response = await fetch(`http://${testHost}:${testPort}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
          id: 1,
        }),
      });

      // Server should respond (even if it's SSE format, it should return 200)
      expect(response.status).toBe(200);

      // Verify content-type header indicates SSE or JSON
      const contentType = response.headers.get('content-type');
      expect(contentType).toBeTruthy();
      expect(
        contentType?.includes('text/event-stream') ||
          contentType?.includes('application/json'),
      ).toBe(true);

      // Close the streaming response to avoid hanging server.close
      try {
        controller.abort();
      } catch (_) {
        // ignore abort errors
      }
      try {
        await response.body?.cancel();
      } catch (_) {
        // ignore cancellation errors
      }

      console.log('✓ Server started and responding successfully');
    } finally {
      exitSpy.mockRestore();
    }
  }, 15000);

  it('should reject invalid port numbers', async () => {
    const invalidServer = new WebMCPServer();

    await expect(
      invalidServer.launchHttp({
        port: -1,
        host: testHost,
      }),
    ).rejects.toThrow(/Invalid port number/);

    await expect(
      invalidServer.launchHttp({
        port: 99999,
        host: testHost,
      }),
    ).rejects.toThrow(/Invalid port number/);
  });

  it('should handle port already in use error gracefully', async () => {
    // Mock process.exit to prevent test exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      // Just throw an error instead of actually exiting
    }) as any);

    try {
      // First server is already running on testPort from previous test
      const conflictServer = new WebMCPServer();

      // This should fail because the port is already in use
      const launchPromise = conflictServer.launchHttp({
        port: testPort,
        host: testHost,
      });

      // Wait for the error to be detected
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify that process.exit was called with error code
      expect(exitSpy).toHaveBeenCalledWith(1);

      console.log('✓ Port conflict handled correctly');
    } finally {
      exitSpy.mockRestore();
    }
  }, 5000);
});
