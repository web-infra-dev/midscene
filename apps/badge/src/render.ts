import { LOGO_96, LOGO_RATIO } from './logo';

export type BadgeStyle = 'flat' | 'large' | 'card';
export type BadgeTheme = 'light' | 'dark';

export interface BadgeOptions {
  pass: number;
  fail: number;
  skipped?: number;
  style: BadgeStyle;
  theme: BadgeTheme;
}

const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';
const COLORS = {
  pass: '#1F9D55',
  fail: '#D73A49',
  zero: '#8B949E',
  slate: '#3A4953', // logo outline color
};

// Approximate Verdana advance widths at 11px. `textLength` pins the final
// width so renderers with a different fallback font keep the same layout.
const CHAR_WIDTHS: Record<string, number> = {
  ' ': 3.9,
  a: 6.7,
  b: 6.8,
  c: 5.8,
  d: 6.8,
  e: 6.6,
  f: 3.8,
  i: 3.0,
  l: 3.0,
  n: 6.9,
  p: 6.8,
  s: 5.7,
  t: 4.3,
  y: 6.5,
  j: 3.8,
  E: 6.8,
  M: 9.3,
  T: 6.8,
  '%': 11.8,
  '.': 3.9,
};
const DEFAULT_CHAR_WIDTH = 7.0;

export function textWidth(s: string, size = 11, bold = false): number {
  const base = [...s].reduce(
    (sum, ch) => sum + (CHAR_WIDTHS[ch] ?? DEFAULT_CHAR_WIDTH),
    0,
  );
  return base * (size / 11) * (bold ? 1.08 : 1);
}

interface TextOptions {
  size?: number;
  bold?: boolean;
  fill?: string;
  shadow?: boolean;
  anchor?: 'start' | 'end';
}

function text(x: number, y: number, s: string, options: TextOptions = {}) {
  const {
    size = 11,
    bold = false,
    fill = '#fff',
    shadow = false,
    anchor = 'start',
  } = options;
  const len = textWidth(s, size, bold).toFixed(1);
  const attrs = `font-size="${size}"${bold ? ' font-weight="700"' : ''} textLength="${len}" lengthAdjust="spacingAndGlyphs" text-anchor="${anchor}"`;
  const shadowText = shadow
    ? `<text x="${x}" y="${y + 1}" ${attrs} fill="#010101" fill-opacity=".3">${s}</text>`
    : '';
  return `${shadowText}<text x="${x}" y="${y}" ${attrs} fill="${fill}">${s}</text>`;
}

// 10x10 status glyphs drawn as strokes, positioned by their top-left corner.
const check = (x: number, y: number, color = '#fff', sw = 1.8) =>
  `<path d="M${x + 1.5} ${y + 5.2}l2.6 2.6L${x + 8.6} ${y + 2.4}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
const cross = (x: number, y: number, color = '#fff', sw = 1.8) =>
  `<path d="M${x + 2} ${y + 2}l6 6M${x + 8} ${y + 2}l-6 6" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;

const skip = (x: number, y: number, color = '#fff', sw = 1.8) =>
  `<path d="M${x + 2} ${y + 5}h6" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;

function svg(w: number, h: number, title: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;
}

const ariaLabel = (pass: number, fail: number, skipped: number) =>
  `Midscene Test: ${pass} passed, ${fail} failed${skipped > 0 ? `, ${skipped} skipped` : ''}`;

// Single-line palette. The label uses the logo outline color so the logo's
// outline melts into the background and the logo reads as part of the label.
const LINE_COLORS = {
  label: COLORS.slate,
  pass: '#2DA44E',
  fail: '#CF222E',
  zero: '#8C959F',
  by: '#6E56CF',
};

const LINE_SIZES = {
  // 20px: same height as shields.io badges.
  flat: {
    h: 20,
    size: 11,
    bold: false,
    logoW: 16,
    pad: 6,
    rx: 3,
    baseline: 14,
    sw: 1.8,
  },
  // 28px: for standalone display at the top of a README.
  large: {
    h: 28,
    size: 12,
    bold: true,
    logoW: 22,
    pad: 9,
    rx: 6,
    baseline: 18.5,
    sw: 2,
  },
};

export type LineVariant = 'flat' | 'large';

/** Static attribution: [logo E2E | by Midscene.js]. */
export function renderByMidscene(variant: LineVariant) {
  const { h, size, logoW, pad, rx, baseline } = LINE_SIZES[variant];
  const title = 'E2E';
  const byText = 'by Midscene.js';
  const segA = pad - 1 + logoW + 4 + textWidth(title, size, true) + pad;
  const segB = pad + textWidth(byText, size, true) + pad;
  const w = Math.ceil(segA + segB);
  const logoH = logoW * LOGO_RATIO;
  const body = `<clipPath id="r"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath><g clip-path="url(#r)"><rect width="${segA}" height="${h}" fill="${LINE_COLORS.label}"/><rect x="${segA}" width="${w - segA}" height="${h}" fill="${LINE_COLORS.by}"/></g><image x="${pad - 2}" y="${((h - logoH) / 2).toFixed(2)}" width="${logoW}" height="${logoH.toFixed(2)}" href="${LOGO_96}"/><g font-family="${FONT}">${text(pad + logoW + 2, baseline, title, { size, bold: true, shadow: true })}${text(segA + pad, baseline, byText, { size, bold: true, shadow: true })}</g>`;
  return svg(w, h, 'E2E by Midscene.js', body);
}

/** Single line: [logo E2E | ✓ N passed | ✕ N failed | − N skipped (when nonzero)]. */
function renderLine(
  pass: number,
  fail: number,
  skipped: number,
  variant: LineVariant,
) {
  const { h, size, bold, logoW, pad, rx, baseline, sw } = LINE_SIZES[variant];
  const title = 'E2E';
  const passText = `${pass} passed`;
  const failText = `${fail} failed`;
  const segA = pad - 1 + logoW + 4 + textWidth(title, size, true) + pad;
  const segB = pad + 10 + 4 + textWidth(passText, size, bold) + pad;
  const segC = pad + 10 + 4 + textWidth(failText, size, bold) + pad;
  const skippedText = `${skipped} skipped`;
  const segD =
    skipped > 0 ? pad + 10 + 4 + textWidth(skippedText, size, bold) + pad : 0;
  const xD = segA + segB + segC;
  const w = Math.ceil(xD + segD);
  const xB = segA;
  const xC = segA + segB;
  const glyphY = (h - 10) / 2;
  const logoH = logoW * LOGO_RATIO;
  const failColor = fail > 0 ? LINE_COLORS.fail : LINE_COLORS.zero;
  const body = `<clipPath id="r"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath><g clip-path="url(#r)"><rect width="${segA}" height="${h}" fill="${LINE_COLORS.label}"/><rect x="${xB}" width="${segB}" height="${h}" fill="${LINE_COLORS.pass}"/><rect x="${xC}" width="${skipped > 0 ? segC : w - xC}" height="${h}" fill="${failColor}"/>${skipped > 0 ? `<rect x="${xD}" width="${w - xD}" height="${h}" fill="${LINE_COLORS.zero}"/>` : ''}</g><image x="${pad - 2}" y="${((h - logoH) / 2).toFixed(2)}" width="${logoW}" height="${logoH.toFixed(2)}" href="${LOGO_96}"/><g font-family="${FONT}">${text(pad + logoW + 2, baseline, title, { size, bold: true, shadow: true })}${check(xB + pad - 2, glyphY, '#fff', sw)}${text(xB + pad + 12, baseline, passText, { size, bold, shadow: true })}${cross(xC + pad - 2, glyphY, '#fff', sw)}${text(xC + pad + 12, baseline, failText, { size, bold, shadow: true })}${skipped > 0 ? skip(xD + pad - 2, glyphY, '#fff', sw) + text(xD + pad + 12, baseline, skippedText, { size, bold, shadow: true }) : ''}</g>`;
  return svg(w, h, ariaLabel(pass, fail, skipped), body);
}

const CARD_THEMES = {
  light: {
    bg: '#FFFFFF',
    border: '#D0D7DE',
    title: COLORS.slate,
    sub: '#656D76',
    tile: '#F2F5F8',
    track: '#EAEEF2',
  },
  dark: {
    bg: '#0D1117',
    border: '#30363D',
    title: '#E6EDF3',
    sub: '#8B949E',
    tile: '#FFFFFF',
    track: '#21262D',
  },
};

export function formatPassRate(pass: number, fail: number): string {
  const total = pass + fail;
  const rate = total ? (pass / total) * 100 : 0;
  if (rate === 100 || rate === 0) return `${rate.toFixed(0)}%`;
  // A run with a failure must not round up to 100.0%, nor one with a pass down to 0.0%.
  return `${Math.min(99.9, Math.max(0.1, rate)).toFixed(1)}%`;
}

/** Two lines: title + totals, stats + pass rate, with a pass/fail/skipped ratio bar. */
function renderCard(
  pass: number,
  fail: number,
  skipped: number,
  theme: BadgeTheme,
) {
  const t = CARD_THEMES[theme];
  const total = pass + fail + skipped;
  const rateText = formatPassRate(pass, fail);
  const h = 60;
  const tile = 36;
  const x0 = 12 + tile + 12;
  const title = 'Midscene Test';
  const totalText = `${total} tests`;
  const passText = `${pass} passed`;
  const failText = `${fail} failed`;
  const statsW =
    13 +
    textWidth(passText, 11, true) +
    14 +
    13 +
    textWidth(failText, 11, true) +
    (skipped > 0 ? 14 + 13 + textWidth(`${skipped} skipped`, 11, true) : 0);
  const headW = textWidth(title, 14, true) + 16 + textWidth(totalText, 11);
  const contentW = Math.max(statsW + 14 + textWidth(rateText, 11, true), headW);
  const w = Math.ceil(x0 + contentW + 14);
  const failColor = fail > 0 ? COLORS.fail : t.sub;
  const barY = h - 4;
  const passW = total ? (w * pass) / total : 0;
  const failW = total ? (w * fail) / total : 0;
  const xF = x0 + 13 + textWidth(passText, 11, true) + 14;
  const xS = xF + 13 + textWidth(failText, 11, true) + 14;
  const body = `<clipPath id="r"><rect width="${w}" height="${h}" rx="8"/></clipPath><g clip-path="url(#r)"><rect width="${w}" height="${h}" fill="${t.bg}"/><rect y="${barY}" width="${w}" height="4" fill="${total ? COLORS.zero : t.track}"/><rect y="${barY}" width="${passW.toFixed(1)}" height="4" fill="${COLORS.pass}"/><rect x="${passW.toFixed(1)}" y="${barY}" width="${failW.toFixed(1)}" height="4" fill="${COLORS.fail}"/></g><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="7.5" fill="none" stroke="${t.border}"/><rect x="12" y="${(barY - tile) / 2}" width="${tile}" height="${tile}" rx="8" fill="${t.tile}"/><image x="16" y="${(barY - 28 * LOGO_RATIO) / 2}" width="28" height="${28 * LOGO_RATIO}" href="${LOGO_96}"/><g font-family="${FONT}">${text(x0, 23, title, { size: 14, bold: true, fill: t.title })}${text(w - 14, 23, totalText, { fill: t.sub, anchor: 'end' })}${check(x0 - 1, 33, COLORS.pass, 2)}${text(x0 + 13, 42, passText, { bold: true, fill: COLORS.pass })}${cross(xF - 1, 33, failColor, 2)}${text(xF + 13, 42, failText, { bold: true, fill: failColor })}${skipped > 0 ? skip(xS - 1, 33, t.sub, 2) + text(xS + 13, 42, `${skipped} skipped`, { bold: true, fill: t.sub }) : ''}${text(w - 14, 42, rateText, { bold: true, fill: t.sub, anchor: 'end' })}</g>`;
  return svg(w, h, ariaLabel(pass, fail, skipped), body);
}

export function renderBadge({
  pass,
  fail,
  skipped = 0,
  style,
  theme,
}: BadgeOptions) {
  switch (style) {
    case 'flat':
      return renderLine(pass, fail, skipped, 'flat');
    case 'large':
      return renderLine(pass, fail, skipped, 'large');
    case 'card':
      return renderCard(pass, fail, skipped, theme);
  }
}
