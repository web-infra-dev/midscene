import { MidsceneRPCServer } from './rpc/server';

const DEFAULT_RPC_SERVER_PORT = 6666;

export function startRPCServer(port: number = DEFAULT_RPC_SERVER_PORT) {
  const server = new MidsceneRPCServer();
  server.start(port);
}
