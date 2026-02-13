import net from 'node:net';
import { getDebug } from '@midscene/shared/logger';

const debug = getDebug('vnc:utils');

export interface VNCConnectionCheck {
  available: boolean;
  error?: string;
  host: string;
  port: number;
  serverName?: string;
}

/**
 * Check if a VNC server is reachable at the given host and port
 * Performs a basic TCP connection check and RFB version handshake
 */
export async function checkVNCConnection(
  host: string,
  port = 5900,
  timeout = 5000,
): Promise<VNCConnectionCheck> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const timer = setTimeout(() => {
      socket.destroy();
      resolve({
        available: false,
        error: `Connection timeout after ${timeout}ms`,
        host,
        port,
      });
    }, timeout);

    socket.on('data', (data: Buffer) => {
      clearTimeout(timer);
      const version = data.toString('ascii').trim();
      debug('VNC server version: %s', version);

      socket.destroy();

      if (version.startsWith('RFB')) {
        resolve({
          available: true,
          host,
          port,
          serverName: version,
        });
      } else {
        resolve({
          available: false,
          error: `Unexpected server response: ${version}`,
          host,
          port,
        });
      }
    });

    socket.on('error', (err: Error) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({
        available: false,
        error: `Connection error: ${err.message}`,
        host,
        port,
      });
    });
  });
}
