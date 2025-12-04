import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebMCPServer } from '../src/server.js';

describe('WebMCPServer HTTP mode', () => {
  let server: WebMCPServer;
  const httpServer: Server | null = null;
  const testPort = 13579; // Use a non-standard port for testing
  const testHost = 'localhost';

  beforeAll(async () => {
    server = new WebMCPServer();
  });

  afterAll(async () => {
    // Close the HTTP server
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer!.close(() => resolve());
      });
    }
  });

  it('should start HTTP server successfully and respond to requests', async () => {
    // Mock process.exit to prevent test exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    try {
      // Start server in background
      const serverPromise = server.launchHttp({
        port: testPort,
        host: testHost,
      });

      // Give server time to start
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simply verify the server is listening by trying to connect
      const response = await fetch(`http://${testHost}:${testPort}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
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
