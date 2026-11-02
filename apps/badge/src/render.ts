import { LOGO_64, LOGO_96, LOGO_RATIO } from './logo';

export type BadgeStyle = 'flat' | 'large' | 'card';
export type BadgeTheme = 'light' | 'dark';

export interface BadgeOptions {
  pass: number;
  fail: number;
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

function svg(w: number, h: number, title: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;
}

const ariaLabel = (pass: number, fail: number) =>
  `Midscene Test: ${pass} passed, ${fail} failed`;

/** Single line, 20px high: same height as shields.io badges. */
function renderFlat(pass: number, fail: number) {
  const h = 20;
  const title = 'E2E';
  const logoW = 14;
  const passText = `${pass} passed`;
  const failText = `${fail} failed`;
  const segA = 6 + logoW + 4 + textWidth(title) + 7;
  const segB = 6 + 10 + 3 + textWidth(passText) + 7;
  const segC = 6 + 10 + 3 + textWidth(failText) + 7;
  const w = Math.ceil(segA + segB + segC);
  const xB = segA;
  const xC = segA + segB;
  const failColor = fail > 0 ? COLORS.fail : COLORS.zero;
  const body = `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${w}" height="${h}" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="${segA}" height="${h}" fill="#fff"/><rect x="${xB}" width="${segB}" height="${h}" fill="${COLORS.pass}"/><rect x="${xC}" width="${segC}" height="${h}" fill="${failColor}"/><rect width="${w}" height="${h}" fill="url(#s)"/></g><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="2.5" fill="none" stroke="#D0D7DE"/><image x="6" y="${(h - logoW * LOGO_RATIO) / 2}" width="${logoW}" height="${logoW * LOGO_RATIO}" href="${LOGO_64}"/><g font-family="${FONT}">${text(6 + logoW + 4, 14, title, { fill: COLORS.slate })}${check(xB + 5, 5)}${text(xB + 19, 14, passText, { shadow: true })}${cross(xC + 5, 5)}${text(xC + 19, 14, failText, { shadow: true })}</g>`;
  return svg(w, h, ariaLabel(pass, fail), body);
}

/** Single line, 28px high: for standalone display at the top of a README. */
function renderLarge(pass: number, fail: number) {
  const h = 28;
  const size = 12;
  const title = 'E2E';
  const logoW = 20;
  const passText = `${pass} passed`;
  const failText = `${fail} failed`;
  const segA = 9 + logoW + 7 + textWidth(title, size, true) + 11;
  const segB = 10 + 10 + 5 + textWidth(passText, size, true) + 11;
  const segC = 10 + 10 + 5 + textWidth(failText, size, true) + 11;
  const w = Math.ceil(segA + segB + segC);
  const xB = segA;
  const xC = segA + segB;
  const failColor = fail > 0 ? COLORS.fail : COLORS.zero;
  const body = `<clipPath id="r"><rect width="${w}" height="${h}" rx="6"/></clipPath><g clip-path="url(#r)"><rect width="${segA}" height="${h}" fill="#fff"/><rect x="${xB}" width="${segB}" height="${h}" fill="${COLORS.pass}"/><rect x="${xC}" width="${segC}" height="${h}" fill="${failColor}"/><rect x="${xC}" width="1" height="${h}" fill="#000" fill-opacity=".12"/></g><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="5.5" fill="none" stroke="#D0D7DE"/><image x="9" y="${(h - logoW * LOGO_RATIO) / 2}" width="${logoW}" height="${logoW * LOGO_RATIO}" href="${LOGO_64}"/><g font-family="${FONT}">${text(9 + logoW + 7, 18.5, title, { size, bold: true, fill: COLORS.slate })}${check(xB + 10, 9, '#fff', 2)}${text(xB + 25, 18.5, passText, { size, bold: true })}${cross(xC + 10, 9, '#fff', 2)}${text(xC + 25, 18.5, failText, { size, bold: true })}</g>`;
  return svg(w, h, ariaLabel(pass, fail), body);
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
  return `${rate === 100 || rate === 0 ? rate.toFixed(0) : rate.toFixed(1)}%`;
}

/** Two lines: title + totals, stats + pass rate, with a pass/fail ratio bar. */
function renderCard(pass: number, fail: number, theme: BadgeTheme) {
  const t = CARD_THEMES[theme];
  const total = pass + fail;
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
    textWidth(failText, 11, true);
  const headW = textWidth(title, 14, true) + 16 + textWidth(totalText, 11);
  const contentW = Math.max(statsW + 14 + textWidth(rateText, 11, true), headW);
  const w = Math.ceil(x0 + contentW + 14);
  const failColor = fail > 0 ? COLORS.fail : t.sub;
  const barY = h - 4;
  const passW = total ? (w * pass) / total : 0;
  const xF = x0 + 13 + textWidth(passText, 11, true) + 14;
  const body = `<clipPath id="r"><rect width="${w}" height="${h}" rx="8"/></clipPath><g clip-path="url(#r)"><rect width="${w}" height="${h}" fill="${t.bg}"/><rect y="${barY}" width="${w}" height="4" fill="${total ? COLORS.fail : t.track}"/><rect y="${barY}" width="${passW.toFixed(1)}" height="4" fill="${COLORS.pass}"/></g><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="7.5" fill="none" stroke="${t.border}"/><rect x="12" y="${(barY - tile) / 2}" width="${tile}" height="${tile}" rx="8" fill="${t.tile}"/><image x="16" y="${(barY - 28 * LOGO_RATIO) / 2}" width="28" height="${28 * LOGO_RATIO}" href="${LOGO_96}"/><g font-family="${FONT}">${text(x0, 23, title, { size: 14, bold: true, fill: t.title })}${text(w - 14, 23, totalText, { fill: t.sub, anchor: 'end' })}${check(x0 - 1, 33, COLORS.pass, 2)}${text(x0 + 13, 42, passText, { bold: true, fill: COLORS.pass })}${cross(xF - 1, 33, failColor, 2)}${text(xF + 13, 42, failText, { bold: true, fill: failColor })}${text(w - 14, 42, rateText, { bold: true, fill: t.sub, anchor: 'end' })}</g>`;
  return svg(w, h, ariaLabel(pass, fail), body);
}

export function renderBadge({ pass, fail, style, theme }: BadgeOptions) {
  switch (style) {
    case 'flat':
      return renderFlat(pass, fail);
    case 'large':
      return renderLarge(pass, fail);
    case 'card':
      return renderCard(pass, fail, theme);
  }
}
