import queryString from 'query-string';

import { ChromeExtensionProxyPage } from '@midscene/web/chrome-extension';
import { StaticPage, StaticPageAgent } from '@midscene/web/playground';
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
  const [agent, setAgent] = useState<StaticPageAgent | null>(null);

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
      setAgent(new StaticPageAgent(new StaticPage(context)));
    });
  }, [targetTabId, targetWindowId]);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <Playground agent={agent} />
    </ConfigProvider>
  );
};

const element = document.getElementById('app');
const root = ReactDOM.createRoot(element!);
root.render(<PlaygroundEntry />);
