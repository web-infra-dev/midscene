import React from 'react';
import type { CSSProperties } from 'react';
import './index.less';

type ClickReticleProps = {
  className?: string;
  opacity?: number;
  scale?: number | string;
  style?: CSSProperties;
};

type ClickReticleStyle = CSSProperties & {
  '--click-reticle-scale': number | string;
};

export function ClickReticle({
  className,
  opacity,
  scale = 1,
  style,
}: ClickReticleProps) {
  const rootClassName = ['click-reticle', className].filter(Boolean).join(' ');
  const reticleStyle: ClickReticleStyle = {
    ...style,
    '--click-reticle-scale': scale,
  };

  if (opacity !== undefined) {
    reticleStyle.opacity = opacity;
  }

  return (
    <div className={rootClassName} style={reticleStyle}>
      <div className="click-reticle-ring" />
      <div className="click-reticle-cross" />
    </div>
  );
}
