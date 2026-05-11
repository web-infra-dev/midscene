import type { CSSProperties } from 'react';

export interface MaskedIconProps {
  src: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Render an asset (PNG or SVG) as a CSS mask so its color follows the
 * parent's `color`/`text-*` token via `bg-current`. Use this for sidebar
 * platform glyphs and other monochrome icons that must adapt to dark mode
 * without shipping per-theme variants.
 */
export function MaskedIcon({ className, src, style }: MaskedIconProps) {
  const maskStyle: CSSProperties = {
    maskImage: `url("${src}")`,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
    WebkitMaskImage: `url("${src}")`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: 'contain',
    ...style,
  };

  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className ?? 'h-4 w-4'}`}
      style={maskStyle}
    />
  );
}
