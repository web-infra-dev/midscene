import { ChromeExtensionBridgeServer } from '@midscene/web/chrome-extension';
import { Button } from 'antd';
import { useEffect, useState } from 'react';

export default function Bridge() {
  const [bridge, setBridge] = useState<ChromeExtensionBridgeServer | null>(
    null,
  );
  useEffect(() => {
    const bridge = new ChromeExtensionBridgeServer();
    bridge.listen();
    setBridge(bridge);
  }, []);

  return (
    <div>
      <h1>Bridge List</h1>
      <div>
        {Object.entries(bridge?.connectedPages || {}).map(([tabId, page]) => (
          <div key={tabId}>{tabId}</div>
        ))}
      </div>
      <Button
        onClick={() => {
          bridge?.newTabWithUrl('https://www.baidu.com');
          console.log(bridge?.connectedPages);
        }}
      >
        new tab
      </Button>
    </div>
  );
}
