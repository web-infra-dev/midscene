import React from 'react';
import ConnectionClosedIcon from './icons/connection-closed.svg';

// Mirrors apps/studio's DisconnectedPreview so the standalone playgrounds
// stop rendering a broken `<img src="/mjpeg">` placeholder in their preview
// pane before a session is created. The same icon + layout keep the visual
// language consistent between Studio and the iOS / Android / Harmony /
// Computer playground binaries.
void React;

export interface DisconnectedPreviewProps {
  title?: string;
}

export function DisconnectedPreview({
  title = 'Connect to a device',
}: DisconnectedPreviewProps) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <ConnectionClosedIcon
          aria-hidden="true"
          style={{ width: 24, height: 24, objectFit: 'contain' }}
        />
        <h2
          style={{
            margin: 0,
            whiteSpace: 'nowrap',
            textAlign: 'center',
            fontSize: 13,
            lineHeight: '24px',
            fontWeight: 400,
            color: 'rgba(0, 0, 0, 0.85)',
          }}
        >
          {title}
        </h2>
      </div>
    </div>
  );
}
