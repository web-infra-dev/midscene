export type ConnectionStatus = 'connected' | 'disconnected' | 'failed';

// Outer translucent halo + solid inner disc of the same hue. Default
// sizing is 12px outer / 8px inner; callers can pass a smaller `size`
// (e.g. the 6px sidebar dot) and the inner scales proportionally.
const PALETTE: Record<ConnectionStatus, { inner: string; border: string }> = {
  connected: {
    inner: 'rgba(18, 185, 129, 1)',
    border: 'rgba(18, 185, 129, 0.25)',
  },
  disconnected: {
    inner: 'rgba(182, 182, 182, 1)',
    border: 'rgba(182, 182, 182, 0.25)',
  },
  failed: {
    inner: 'rgba(229, 57, 53, 1)',
    border: 'rgba(229, 57, 53, 0.25)',
  },
};

const LABEL: Record<ConnectionStatus, string> = {
  connected: 'Device connected',
  disconnected: 'Device not connected',
  failed: 'Device connection failed',
};

export interface ConnectionStatusDotProps {
  status: ConnectionStatus;
  /** Outer halo diameter in px. Defaults to 12. */
  size?: number;
}

export function ConnectionStatusDot({
  status,
  size = 12,
}: ConnectionStatusDotProps) {
  const { inner, border } = PALETTE[status];
  const innerSize = Math.max(2, Math.round((size * 2) / 3));
  return (
    <span
      role="img"
      aria-label={LABEL[status]}
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        background: border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          display: 'block',
          width: innerSize,
          height: innerSize,
          borderRadius: '50%',
          background: inner,
        }}
      />
    </span>
  );
}
