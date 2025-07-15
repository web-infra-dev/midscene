import type { GroupedActionDump } from '@midscene/core';
import type { ExecutionDumpWithPlaywrightAttributes } from '../types';
import { PlaywrightCaseSelector } from './PlaywrightCaseSelector';

import './report-overview.less';

const ReportOverview = (props: {
  title: string;
  version?: string;
  modelName?: string;
  modelDescription?: string;
  proModeEnabled?: boolean;
  onProModeChange?: (enabled: boolean) => void;
  dumps?: ExecutionDumpWithPlaywrightAttributes[];
  selected?: GroupedActionDump | null;
  onSelect?: (dump: GroupedActionDump) => void;
}): JSX.Element => {
  const envInfoEl =
    props.version || props.modelName ? (
      <>
        <div className="env-info-card">
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
      <PlaywrightCaseSelector
        dumps={props.dumps}
        selected={props.selected}
        onSelect={props.onSelect}
      />
      {envInfoEl}
    </div>
  );
};

export default ReportOverview;
