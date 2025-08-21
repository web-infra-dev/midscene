import { Alert } from 'antd';
import type React from 'react';
import ShinyText from '../shiny-text';

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
  <div className="result-empty-tip" style={{ textAlign: 'center' }}>
    <ShinyText disabled text="The result will be shown here" />
  </div>
);

// tracking popup tip
export const trackingTip = 'limit popup to current tab';

// deep think tip
export const deepThinkTip = 'deep think';

export const apiMetadata = {
  aiAction: {
    group: 'interaction',
    title: 'Auto Planning: plan the steps and execute',
  },
  aiTap: { group: 'interaction', title: 'Click an element' },
  aiHover: { group: 'interaction', title: 'Hover over an element' },
  aiInput: { group: 'interaction', title: 'Input text into an element' },
  aiRightClick: { group: 'interaction', title: 'Right-click an element' },
  aiKeyboardPress: { group: 'interaction', title: 'Press keyboard keys' },
  aiScroll: { group: 'interaction', title: 'Scroll the page or element' },
  aiLocate: { group: 'interaction', title: 'Locate an element on the page' },
  aiQuery: {
    group: 'extraction',
    title: 'Extract data directly from the UI',
  },
  aiBoolean: { group: 'extraction', title: 'Get true/false answer' },
  aiNumber: { group: 'extraction', title: 'Extract numeric value' },
  aiString: { group: 'extraction', title: 'Extract text value' },
  aiAsk: { group: 'extraction', title: 'Ask a question about the UI' },
  aiAssert: { group: 'validation', title: 'Assert a condition is true' },
  aiWaitFor: { group: 'validation', title: 'Wait for a condition to be met' },
};

export const defaultMainButtons = ['aiAction', 'aiTap', 'aiQuery', 'aiAssert'];
