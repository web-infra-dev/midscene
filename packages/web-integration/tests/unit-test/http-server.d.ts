declare module 'http-server' {
  export function createServer(options: http.ServerOptions): {
    server: http.Server;
    listen: (port: number, host: string, callback: () => void) => void;
  };
}
