import { globalThemeConfig } from '@midscene/visualizer';
import { ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

export function PlaygroundThemeProvider({ children }: PropsWithChildren) {
  return (
    <ConfigProvider theme={globalThemeConfig()}>{children}</ConfigProvider>
  );
}
