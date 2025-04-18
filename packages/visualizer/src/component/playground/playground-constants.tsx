import { Alert } from 'antd';
import type React from 'react';

import './index.less';

// server not ready error message
export const errorMessageServerNotReady = (
  <span>
    Don&apos;t worry, just one more step to launch the playground server.
    <br />
    Please run one of the commands under the midscene project directory:
    <br />
    a. <strong>npx midscene-playground</strong>
    <br />
    b. <strong>npx --yes @midscene/web</strong>
  </span>
);

// server launch tip
export const serverLaunchTip = (
  notReadyMessage: React.ReactNode | string = errorMessageServerNotReady,
) => (
  <div className="server-tip">
    <Alert
      message="Playground Server Not Ready"
      description={notReadyMessage}
      type="warning"
    />
  </div>
);

// empty result tip
export const emptyResultTip = (
  <div className="result-empty-tip" style={{}}>
    <span>The result will be shown here</span>
  </div>
);

// tracking popup tip
export const trackingTip = 'limit popup to current tab';

// deep think tip
export const deepThinkTip = 'deep think';
