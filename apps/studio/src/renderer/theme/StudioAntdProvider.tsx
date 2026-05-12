import { ConfigProvider, theme as antdTheme } from 'antd';
import type { PropsWithChildren } from 'react';
import { useStudioTheme } from './ThemeProvider';

/*
 * antd's ConfigProvider tokens must be real hex values, not CSS variables:
 * tinycolor (used internally to derive hover/active/border variants) cannot
 * parse `var(--...)` strings. So we maintain two sources of the same palette:
 *
 *   - `App.css` `:root` / `[data-theme='dark']` define `--midscene-*`
 *   - The LIGHT_TOKENS / DARK_TOKENS tables below feed the same palette to antd
 *
 * Whenever you change a token value here, update the matching `--midscene-*`
 * in `App.css` (and vice versa). Keep the two tables byte-identical for colors
 * that map one-to-one (surface, text, border, brand, status).
 */

const BRAND = '#1979ff';

const LIGHT_TOKENS = {
  colorPrimary: BRAND,
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBgLayout: '#f6f6f6',
  colorText: '#0d0d0d',
  colorTextSecondary: '#474848',
  colorTextTertiary: '#797a7a',
  colorTextPlaceholder: '#9d9fa0',
  colorBorder: '#ececec',
  colorBorderSecondary: '#e9ecf3',
  colorSuccess: '#12b981',
  colorError: '#e13e37',
  colorInfo: BRAND,
} as const;

const DARK_TOKENS = {
  colorPrimary: BRAND,
  colorBgContainer: '#2b2b2b',
  colorBgElevated: '#2b2b2b',
  colorBgLayout: '#171717',
  colorText: '#ffffff',
  colorTextSecondary: '#d0d0d1',
  colorTextTertiary: '#9da0a1',
  colorTextPlaceholder: '#6f7173',
  colorBorder: '#2e2e2e',
  colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
  colorSuccess: '#12b981',
  colorError: '#e13e37',
  colorInfo: BRAND,
} as const;

export function StudioAntdProvider({ children }: PropsWithChildren) {
  const { resolved } = useStudioTheme();
  const isDark = resolved === 'dark';

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
        token: isDark ? DARK_TOKENS : LIGHT_TOKENS,
      }}
    >
      {children}
    </ConfigProvider>
  );
}
