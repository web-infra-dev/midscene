export type ConnectionStatus = 'connected' | 'disconnected' | 'failed';

// Visible footprint = 8px solid disc + 2px translucent border on each side
// of the same hue, so the SVG canvas is 12×12.
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
}

export function ConnectionStatusDot({ status }: ConnectionStatusDotProps) {
  const { inner, border } = PALETTE[status];
  return (
    <span
      role="img"
      aria-label={LABEL[status]}
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          display: 'block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: inner,
        }}
      />
    </span>
  );
}
