import { once } from 'node:events';
import { createServer } from 'node:http';
import {
  SCRCPY_MAX_IN_FLIGHT_BYTES,
  SCRCPY_MAX_IN_FLIGHT_PACKETS,
  SCRCPY_VIDEO_ACK_TIMEOUT_MS,
  ScrcpyVideoSender,
} from '@/scrcpy-video-sender';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { Server, type Socket } from 'socket.io';
import { io } from 'socket.io-client';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  rs.useRealTimers();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function connect() {
  const http = createServer();
  const server = new Server(http);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const connected = new Promise<Socket>((resolve) =>
    server.once('connection', resolve),
  );
  const client = io(`http://127.0.0.1:${address.port}`, {
    transports: ['websocket'],
    reconnection: false,
  });
  cleanups.push(async () => {
    client.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await once(client, 'connect');
  const socket = await connected;
  return { socket, client, sender: new ScrcpyVideoSender(socket) };
}

function frame(size = 1, keyframe = false) {
  return { type: 'data' as const, data: new Uint8Array(size), keyframe };
}

describe('ScrcpyVideoSender', () => {
  it('bounds an unacknowledged burst and closes instead of sending a partial GOP', async () => {
    const { sender, socket } = await connect();
    for (let index = 0; index < SCRCPY_MAX_IN_FLIGHT_PACKETS; index++) {
      sender.send(frame());
    }
    expect(socket.connected).toBe(true);
    expect(() => sender.send(frame())).toThrow('receiver is too slow');
    expect(socket.conn.readyState).toBe('closed');
    expect(() => sender.send(frame(1, true))).toThrow(
      'closed scrcpy connection',
    );
  });

  it('bounds bytes even when the packet-count window still has room', async () => {
    const { sender, socket } = await connect();
    sender.send(frame(SCRCPY_MAX_IN_FLIGHT_BYTES, true));
    expect(() => sender.send(frame())).toThrow('receiver is too slow');
    expect(socket.conn.readyState).toBe('closed');
  });

  it('rejects an oversized first keyframe before retaining it in the transport', async () => {
    const { sender, socket } = await connect();
    const emit = rs.spyOn(socket, 'emit');
    expect(() =>
      sender.send(frame(SCRCPY_MAX_IN_FLIGHT_BYTES + 1, true)),
    ).toThrow('receiver is too slow');
    expect(emit).not.toHaveBeenCalled();
    expect(socket.conn.readyState).toBe('closed');
  });

  it('returns byte and packet credit on receipt without serializing frame sends', async () => {
    const { sender, socket, client } = await connect();
    const acknowledgements: (() => void)[] = [];
    client.on('video-data', (_packet, acknowledge) =>
      acknowledgements.push(acknowledge),
    );
    const size = SCRCPY_MAX_IN_FLIGHT_BYTES / SCRCPY_MAX_IN_FLIGHT_PACKETS;
    for (let index = 0; index < SCRCPY_MAX_IN_FLIGHT_PACKETS; index++)
      sender.send(frame(size));
    await rs.waitFor(() =>
      expect(acknowledgements).toHaveLength(SCRCPY_MAX_IN_FLIGHT_PACKETS),
    );
    const ackReceived = once(socket, 'credit-released');
    // Socket.IO preserves event order: this marker arrives after the ACK.
    acknowledgements[0]();
    client.emit('credit-released');
    await ackReceived;
    expect(() => sender.send(frame(size))).not.toThrow();
    expect(() => sender.send(frame())).toThrow('receiver is too slow');
  });

  it('expires a stalled receiver even if only one packet is outstanding', async () => {
    const { sender, socket } = await connect();
    rs.useFakeTimers();
    sender.send(frame(1, true));
    await rs.advanceTimersByTimeAsync(SCRCPY_VIDEO_ACK_TIMEOUT_MS);
    expect(socket.conn.readyState).toBe('closed');
  });

  it('delivers configuration and an intact GOP after reconnecting', async () => {
    const stalled = await connect();
    for (let index = 0; index < SCRCPY_MAX_IN_FLIGHT_PACKETS; index++)
      stalled.sender.send(frame());
    expect(() => stalled.sender.send(frame())).toThrow('receiver is too slow');

    const { sender, client, socket } = await connect();
    const received: { type: string; keyFrame?: boolean; data: Uint8Array }[] =
      [];
    client.on('video-data', (packet, acknowledge) => {
      received.push(packet);
      acknowledge();
    });
    sender.send({ type: 'configuration', data: new Uint8Array([99]) });
    sender.send(frame(1, true));
    sender.send(frame());
    await rs.waitFor(() => expect(received).toHaveLength(3));
    expect(received.map(({ type, keyFrame }) => ({ type, keyFrame }))).toEqual([
      { type: 'configuration', keyFrame: undefined },
      { type: 'data', keyFrame: true },
      { type: 'data', keyFrame: false },
    ]);
    expect(socket.connected).toBe(true);
  });
});
