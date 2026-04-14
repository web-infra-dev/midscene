import { ConfigProvider, theme as antdTheme } from 'antd';
import type { PropsWithChildren } from 'react';
import { useStudioTheme } from './ThemeProvider';

export function StudioAntdProvider({ children }: PropsWithChildren) {
  const { mode } = useStudioTheme();
  const isDark = mode === 'dark';

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: 'var(--studio-brand)',
          colorBgContainer: 'var(--studio-surface-elevated)',
          colorBgElevated: 'var(--studio-surface-elevated)',
          colorBgLayout: 'var(--studio-app-bg)',
          colorText: 'var(--studio-text-primary)',
          colorTextSecondary: 'var(--studio-text-secondary)',
          colorTextTertiary: 'var(--studio-text-tertiary)',
          colorTextPlaceholder: 'var(--studio-text-placeholder)',
          colorBorder: 'var(--studio-border-subtle)',
          colorBorderSecondary: 'var(--studio-border-strong)',
          colorSuccess: 'var(--studio-status-success)',
          colorError: 'var(--studio-status-error)',
          colorInfo: 'var(--studio-status-info)',
          colorFill: 'var(--studio-surface-hover)',
          colorFillSecondary: 'var(--studio-surface-muted)',
          colorFillTertiary: 'var(--studio-surface-hover)',
          colorFillQuaternary: 'var(--studio-surface-hover)',
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
