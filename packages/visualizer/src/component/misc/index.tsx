import {
  ArrowRightOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  LogoutOutlined,
  MinusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert } from 'antd';
import type React from 'react';
import ShinyText from '../shiny-text';

export function timeCostStrElement(timeCost?: number) {
  let str: string;
  if (typeof timeCost !== 'number') {
    str = '-';
  } else {
    str = `${(timeCost / 1000).toFixed(2)}s`;
  }
  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: 'tnum',
      }}
    >
      {str}
    </span>
  );
}

export const iconForStatus = (status: string) => {
  switch (status) {
    case 'finished':
    case 'passed':
    case 'success':
    case 'connected':
      return (
        <span style={{ color: '#00AD4B' }}>
          <CheckOutlined />
        </span>
      );

    case 'finishedWithWarning':
      return (
        <span style={{ color: '#f7bb05' }}>
          <WarningOutlined />
        </span>
      );
    case 'failed':
    case 'closed':
    case 'timedOut':
    case 'interrupted':
      return (
        <span style={{ color: '#FF0A0A' }}>
          <CloseOutlined />
        </span>
      );
    case 'pending':
      return <ClockCircleOutlined />;
    case 'cancelled':
    case 'skipped':
      return <LogoutOutlined />;
    case 'running':
      return <ArrowRightOutlined />;
    default:
      return <MinusOutlined />;
  }
};

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
