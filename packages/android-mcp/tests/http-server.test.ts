import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AndroidMCPServer } from '../src/server.js';

describe('AndroidMCPServer HTTP mode', () => {
  let server: AndroidMCPServer;
  const testPort = 13580; // Use different port than web-bridge-mcp
  const testHost = 'localhost';

  beforeAll(async () => {
    server = new AndroidMCPServer();
  });

  afterAll(async () => {
    // Cleanup will be handled by process exit
  });

  it('should start HTTP server successfully', async () => {
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

      // Server should respond (even if initialization fails without device)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      console.log('✓ Android MCP server started and responding');
    } finally {
      exitSpy.mockRestore();
    }
  }, 10000);

  it('should reject invalid port numbers', async () => {
    const invalidServer = new AndroidMCPServer();

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
});
