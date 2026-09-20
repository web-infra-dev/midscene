declare module 'http-server' {
  import type { Server } from 'node:http';
  export function createServer(options: { root: string }): {
    server: Server;
    listen(port: number, host: string, callback: () => void): void;
  };
}
