import type React from 'react';
import './shiny-text.less';

type ColorTheme = 'blue' | 'purple' | 'green' | 'rainbow';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  colorTheme?: ColorTheme;
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 5,
  className = '',
}) => {
  const style = {
    '--animation-duration': `${speed}s`,
  } as React.CSSProperties;

  return (
    <div
      className={`shiny-text ${disabled ? 'disabled' : ''} ${className}`}
      style={style}
    >
      {text}
    </div>
  );
};

