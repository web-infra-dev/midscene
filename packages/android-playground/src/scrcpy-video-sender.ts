import { getDebug } from '@midscene/shared/logger';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import type { Socket } from 'socket.io';

// Bound both large keyframes and long bursts of tiny frames. ACKs cover the
// entire path through the browser's socket handler, not just a local TCP write.
export const SCRCPY_MAX_IN_FLIGHT_BYTES = 8 * 1024 * 1024;
export const SCRCPY_MAX_IN_FLIGHT_PACKETS = 256;
export const SCRCPY_VIDEO_ACK_TIMEOUT_MS = 10_000;
const debug = getDebug('android:playground:video', { console: true });

export function buildScrcpyVideoPacket(
  packet: ScrcpyMediaStreamPacket,
  timestamp = Date.now(),
) {
  return {
    data: packet.data,
    type: packet.type,
    timestamp,
    keyFrame: packet.type === 'data' ? packet.keyframe : undefined,
  };
}

// One sender per socket, shared across scrcpy sessions on that connection.
// Never reset credit on a device switch while old packets are still in flight.
export class ScrcpyVideoSender {
  private inFlightBytes = 0;
  private inFlightPackets = 0;
  private failed = false;

  constructor(private readonly socket: Socket) {}

  private fail(message: string) {
    if (this.failed) return;
    this.failed = true;
    debug(message);
    // Discard instead of waiting for an overloaded transport to drain. The
    // existing disconnect recovery starts a fresh decoder/configuration/GOP.
    this.socket.conn.close(true);
  }

  send(packet: ScrcpyMediaStreamPacket) {
    if (this.failed || !this.socket.connected) {
      throw new Error('Cannot send video on a closed scrcpy connection');
    }
    const bytes = packet.data.byteLength;
    if (
      this.inFlightPackets >= SCRCPY_MAX_IN_FLIGHT_PACKETS ||
      this.inFlightBytes + bytes > SCRCPY_MAX_IN_FLIGHT_BYTES
    ) {
      const message = 'Scrcpy video receiver is too slow; reconnecting preview';
      this.fail(message);
      throw new Error(message);
    }

    this.inFlightBytes += bytes;
    this.inFlightPackets += 1;
    this.socket
      .timeout(SCRCPY_VIDEO_ACK_TIMEOUT_MS)
      .emit(
        'video-data',
        buildScrcpyVideoPacket(packet),
        (error: Error | null) => {
          this.inFlightBytes -= bytes;
          this.inFlightPackets -= 1;
          if (error && this.socket.connected) {
            this.fail(
              'Scrcpy video acknowledgement timed out; reconnecting preview',
            );
          }
        },
      );
  }
}
