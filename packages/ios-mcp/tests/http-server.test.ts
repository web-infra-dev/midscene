import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IOSMCPServer } from '../src/server.js';

describe('IOSMCPServer HTTP mode', () => {
  let server: IOSMCPServer;
  const testPort = 13581; // Use different port than other MCP servers
  const testHost = '127.0.0.1'; // Use IPv4 explicitly to avoid IPv6 issues in CI

  beforeAll(async () => {
    server = new IOSMCPServer();
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
      // Start server in background and handle potential errors
      const serverPromise = server.launchHttp({
        port: testPort,
        host: testHost,
      });

      // Catch any errors from server startup without blocking
      serverPromise.catch((error) => {
        console.error('Server startup error:', error);
      });

      // Wait for server to start with retries (up to 5 seconds)
      let connected = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
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
          connected = true;
          console.log(
            `✓ iOS MCP server started and responding (attempt ${i + 1})`,
          );
          break;
        } catch (error) {
          if (i === 9) {
            throw error; // Throw on last attempt
          }
          // Otherwise continue retrying
        }
      }

      expect(connected).toBe(true);
    } finally {
      exitSpy.mockRestore();
    }
  }, 15000); // Increase timeout for CI

  it('should reject invalid port numbers', async () => {
    const invalidServer = new IOSMCPServer();

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
