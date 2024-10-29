import queryString from 'query-string';

import type { UIContext } from '@midscene/core/.';
import { ChromeExtensionProxyPage } from '@midscene/web/chrome-extension';
import { parseContextFromWebPage } from '@midscene/web/utils';
import { ConfigProvider } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { globalThemeConfig } from '../component/color';
import { Playground } from '../component/playground-component';

const PlaygroundEntry = () => {
  // extension proxy agent
  const query = useMemo(
    () => queryString.parse(window.location.search),
    [window.location.search],
  );
  const targetTabId = query.tab_id;
  const targetWindowId = query.window_id;
  const [context, setContext] = useState<UIContext | undefined>(undefined);

  useEffect(() => {
    if (!targetTabId || !targetWindowId) {
      throw new Error('targetTabId and targetWindowId are required');
    }
    const page = new ChromeExtensionProxyPage(
      Number(targetTabId),
      Number(targetWindowId),
    );

    parseContextFromWebPage(page).then((context) => {
      console.log('got page context', context);
      setContext(context);
    });
  }, [targetTabId, targetWindowId]);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <Playground propsContext={context} />
    </ConfigProvider>
  );
};

const element = document.getElementById('app');
const root = ReactDOM.createRoot(element!);
root.render(<PlaygroundEntry />);
