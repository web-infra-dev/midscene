import { createServer } from 'node:net';

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.on('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Find an available port starting from the given port
 */
export async function findAvailablePort(
  startPort: number,
  maxAttempts = 15,
): Promise<number> {
  let port = startPort;
  let attempts = 0;

  while (!(await isPortAvailable(port))) {
    attempts++;
    if (attempts >= maxAttempts) {
      console.error(
        `❌ Unable to find available port after ${maxAttempts} attempts starting from ${startPort}`,
      );
      process.exit(1);
    }
    port++;
  }
  return port;
}
