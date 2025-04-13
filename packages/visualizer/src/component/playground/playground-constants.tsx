import { Alert } from 'antd';
import React from 'react';

import './index.less';

// 服务器未就绪错误信息
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

// 服务器启动提示
export const serverLaunchTip = (
  <div className="server-tip">
    <Alert
      message="Playground Server Not Ready"
      description={errorMessageServerNotReady}
      type="warning"
    />
  </div>
);

// 空结果提示
export const emptyResultTip = (
  <div
    className="result-empty-tip"
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      border: '1px solid rgba(0, 0, 0, 0.06)',
      borderRadius: '8px',
      color: 'rgba(0, 0, 0, 0.45)',
      fontSize: '14px',
    }}
  >
    <span>The result will be shown here</span>
  </div>
);

// 跟踪弹出窗口提示
export const trackingTip = 'limit popup to current tab';
