export type ScrcpyVideoTransportData = ArrayBuffer | ArrayBufferView;

export interface ScrcpyVideoTransportMetadata {
  receivedAt: number;
  sentAt: number;
  sequence: number;
  timestamp: number;
}

export type ScrcpyVideoTransportPacket<
  TData extends ScrcpyVideoTransportData = ScrcpyVideoTransportData,
> =
  | (ScrcpyVideoTransportMetadata & {
      data: TData;
      type: 'configuration';
    })
  | (ScrcpyVideoTransportMetadata & {
      data: TData;
      keyFrame: boolean;
      type: 'data';
    });

/**
 * Packets emitted by older Android playground servers did not include
 * sequence or timing metadata. Keep that compatibility explicit instead of
 * weakening the current transport contract with optional fields.
 */
export interface LegacyScrcpyVideoTransportPacket<
  TData extends ScrcpyVideoTransportData = ScrcpyVideoTransportData,
> {
  data: TData;
  keyFrame?: boolean;
  type?: string;
}

export type IncomingScrcpyVideoTransportPacket<
  TData extends ScrcpyVideoTransportData = ScrcpyVideoTransportData,
> = ScrcpyVideoTransportPacket<TData> | LegacyScrcpyVideoTransportPacket<TData>;

export function hasScrcpyVideoTransportMetadata<
  TData extends ScrcpyVideoTransportData,
>(
  packet: IncomingScrcpyVideoTransportPacket<TData>,
): packet is ScrcpyVideoTransportPacket<TData> {
  const candidate = packet as {
    keyFrame?: unknown;
    receivedAt?: unknown;
    sentAt?: unknown;
    sequence?: unknown;
    timestamp?: unknown;
    type?: unknown;
  };
  return (
    Number.isSafeInteger(candidate.sequence) &&
    (candidate.sequence as number) >= 0 &&
    typeof candidate.receivedAt === 'number' &&
    Number.isFinite(candidate.receivedAt) &&
    typeof candidate.sentAt === 'number' &&
    Number.isFinite(candidate.sentAt) &&
    typeof candidate.timestamp === 'number' &&
    Number.isFinite(candidate.timestamp) &&
    (candidate.type === 'configuration' ||
      (candidate.type === 'data' && typeof candidate.keyFrame === 'boolean'))
  );
}
