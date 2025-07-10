import { Switch } from 'antd';
import './report-overview.less';

const ReportOverview = (props: {
  title: string;
  version?: string;
  modelName?: string;
  modelDescription?: string;
  proModeEnabled: boolean;
  onProModeChange: (enabled: boolean) => void;
}): JSX.Element => {
  const envInfoEl =
    props.version || props.modelName ? (
      <>
        <div className="section-separator" />

        <div className="env-info-card">
          <div className="env-info-title">Environment</div>
          <div className="env-info-content">
            {props.version && (
              <div className="env-info-row">
                <span className="env-label">Version:</span>
                <span className="env-value">v{props.version}</span>
              </div>
            )}
            {props.modelName && (
              <div className="env-info-row">
                <span className="env-label">Model:</span>
                <span className="env-value">
                  {props.modelName}
                  {props.modelDescription && `, ${props.modelDescription}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </>
    ) : null;

  return (
    <div className="report-overview">
      <div className="title-header">
        <div className="title-main-name">{props.title}</div>
        <div className="pro-mode-section">
          <span className="pro-mode-label">Pro Mode</span>
          <Switch
            checked={props.proModeEnabled}
            onChange={props.onProModeChange}
            size="small"
          />
        </div>
      </div>
      {envInfoEl}
    </div>
  );
};

export default ReportOverview;
