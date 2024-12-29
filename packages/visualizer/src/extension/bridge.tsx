import {
  ChromeExtensionPageBridgeSide,
  getBridgePageInCliSide,
} from '@midscene/web/chrome-extension';
import { Button } from 'antd';
import { useEffect, useState } from 'react';

export default function Bridge() {
  const [bridge, setBridge] = useState<ChromeExtensionPageBridgeSide | null>(
    null,
  );
  const [tabId, setTabId] = useState<number | null>(null);
  useEffect(() => {
    const bridge = new ChromeExtensionPageBridgeSide();
    bridge.connect();
    setBridge(bridge);
  }, []);

  const newTab = async () => {
    if (!bridge) {
      throw new Error('bridge is not initialized');
    }
    const { tabId } = await bridge.connectNewTabWithUrl(
      'https://www.baidu.com',
    );
    setTabId(tabId);
  };

  const doSomething = async () => {
    if (!tabId) {
      throw new Error('bridge is not initialized');
    }

    const proxy: any = getBridgePageInCliSide(tabId);
    console.log('1');
    console.log(proxy.screenshotBase64());
    console.log('2');
    console.log(await proxy.mouse.click());
    // const page =
    // await bridge.call(tabId, 'screenshotBase64');
  };

  return (
    <div>
      <h1>Bridge List</h1>
      <div>
        {Object.entries(bridge?.connectedPages || {}).map(([tabId, page]) => (
          <div key={tabId}>{tabId}</div>
        ))}
      </div>
      <Button onClick={newTab}>new tab</Button>
      <Button
        onClick={() => {
          bridge?.closeAll();
        }}
      >
        close all
      </Button>
      <Button onClick={doSomething}>do something</Button>
    </div>
  );
}
