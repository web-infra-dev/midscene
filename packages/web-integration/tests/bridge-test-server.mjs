/**
 * Minimal bridge server for e2e testing.
 * Starts a Socket.IO server on port 3766 that accepts one client connection.
 * Outputs "CONNECTED" to stdout when a client connects.
 * Outputs "DISCONNECTED" when a client disconnects.
 *
 * Usage: node bridge-test-server.mjs [port]
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const port = Number.parseInt(process.argv[2] || '3766', 10);
const httpServer = createServer();

const io = new Server(httpServer, {
  maxHttpBufferSize: 100 * 1024 * 1024,
});

io.on('connection', (socket) => {
  console.log('CONNECTED');
  socket.emit('bridge-connected', { version: 'test' });

  socket.on('disconnect', (reason) => {
    console.log('DISCONNECTED');
  });
});

httpServer.listen(port, () => {
  console.log(`LISTENING on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  io.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  io.close();
  process.exit(0);
});
