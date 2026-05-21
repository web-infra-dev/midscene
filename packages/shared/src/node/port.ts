import { createServer } from 'node:net';

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  // Probe with the same bind address the real playground/scrcpy servers use
  // (`0.0.0.0`). Calling `listen(port)` without a host defaults to IPv6 `::`
  // on most setups, which can succeed even when another process already
  // holds the IPv4 wildcard for that port — leaving us to crash at real
  // launch time after wrongly concluding the port was free.
  return new Promise((resolve) => {
    const server = createServer();
    server.on('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => {
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
