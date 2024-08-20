import {
  ArrowRightOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  LogoutOutlined,
  MinusOutlined,
  WarningFilled,
} from '@ant-design/icons';

export function timeCostStrElement(timeCost?: number) {
  let str: string;
  if (typeof timeCost !== 'number') {
    str = '- ms';
  } else if (timeCost > 1000) {
    str = `${(timeCost / 1000).toFixed(2)}s`;
  } else {
    str = `${timeCost}ms`;
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

// playwright status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

export const iconForStatus = (status: string): JSX.Element => {
  switch (status) {
    case 'finished':
    case 'passed':
      return (
        <span style={{ color: '#2B8243' }}>
          <CheckCircleFilled />
        </span>
      );

    case 'finishedWithWarning':
      return (
        <span style={{ color: '#f7bb05' }}>
          <WarningFilled />
        </span>
      );
    case 'failed':
    case 'timedOut':
    case 'interrupted':
      return (
        <span style={{ color: '#FF0A0A' }}>
          <CloseCircleFilled />
        </span>
      );
    case 'pending':
      return <ClockCircleFilled />;
    case 'cancelled':
    case 'skipped':
      return <LogoutOutlined />;
    case 'running':
      return <ArrowRightOutlined />;
    default:
      return <MinusOutlined />;
  }
};
