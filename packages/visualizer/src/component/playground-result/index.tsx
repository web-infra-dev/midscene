import { LoadingOutlined } from '@ant-design/icons';
import { noReplayAPIs } from '@midscene/playground';
import { Spin } from 'antd';
import type React from 'react';
import type {
  PlaygroundResult as PlaygroundResultType,
  ReportDownloadHandler,
  ServiceModeType,
} from '../../types';
import type { ReplayScriptsInfo } from '../../utils/replay-scripts';
import { emptyResultTip, serverLaunchTip } from '../misc';
import { Player } from '../player';
import ShinyText from '../shiny-text';
import './index.less';

interface PlaygroundResultProps {
  result: PlaygroundResultType | null;
  loading: boolean;
  serverValid?: boolean;
  serviceMode: ServiceModeType;
  replayScriptsInfo: ReplayScriptsInfo | null;
  replayCounter: number;
  loadingProgressText: string;
  verticalMode?: boolean;
  notReadyMessage?: React.ReactNode | string;
  fitMode?: 'width' | 'height';
  autoZoom?: boolean;
  actionType?: string; // The action type that was executed
  canDownloadReport?: boolean;
  onDownloadReport?: ReportDownloadHandler;
}

export const PlaygroundResultView: React.FC<PlaygroundResultProps> = ({
  result,
  loading,
  serverValid,
  serviceMode,
  replayScriptsInfo,
  replayCounter,
  loadingProgressText,
  verticalMode = false,
  notReadyMessage,
  fitMode,
  autoZoom,
  actionType,
  canDownloadReport,
  onDownloadReport,
}) => {
  let resultWrapperClassName = 'result-wrapper';
  if (verticalMode) {
    resultWrapperClassName += ' vertical-mode-result';
  }
  if (replayScriptsInfo && verticalMode) {
    resultWrapperClassName += ' result-wrapper-compact';
  }

  let resultDataToShow: React.ReactNode = emptyResultTip;

  // Determine if this is a data extraction API that should prioritize result output
  const shouldPrioritizeResult =
    actionType && noReplayAPIs.includes(actionType);

  if (!serverValid && serviceMode === 'Server') {
    resultDataToShow = serverLaunchTip(notReadyMessage);
  } else if (loading) {
    resultDataToShow = (
      <div className="loading-container">
        <Spin spinning={loading} indicator={<LoadingOutlined spin />} />
        <div className="loading-progress-text loading-progress-text-progress">
          <ShinyText text={loadingProgressText} speed={3} />
        </div>
      </div>
    );
  } else if (result?.error) {
    // Show errors first
    const errorNode = (
      <pre style={{ color: '#ff4d4f', whiteSpace: 'pre-wrap' }}>
        {result?.error}
      </pre>
    );

    if (result.reportHTML || replayScriptsInfo) {
      resultDataToShow = (
        <div className="combined-result-layout">
          <div style={{ flex: '0 0 auto', maxHeight: '40%', overflow: 'auto' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              Error:
            </div>
            {errorNode}
          </div>
          <div className="combined-result-section">
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              Report:
            </div>
            <div className="combined-result-player">
              <Player
                key={replayCounter}
                replayScripts={replayScriptsInfo?.scripts}
                imageWidth={replayScriptsInfo?.width}
                imageHeight={replayScriptsInfo?.height}
                reportFileContent={result.reportHTML || null}
                fitMode={fitMode}
                autoZoom={autoZoom}
                canDownloadReport={
                  canDownloadReport ?? serviceMode !== 'In-Browser'
                }
                onDownloadReport={onDownloadReport}
              />
            </div>
          </div>
        </div>
      );
    } else {
      resultDataToShow = errorNode;
    }
  } else if (
    shouldPrioritizeResult &&
    result?.result !== undefined &&
    replayScriptsInfo
  ) {
    // For data extraction APIs: show both result output and replay/report
    const resultOutput =
      typeof result?.result === 'string' ? (
        <pre>{result?.result}</pre>
      ) : (
        <pre>{JSON.stringify(result?.result, null, 2)}</pre>
      );

    const reportContent = result?.reportHTML || null;

    resultDataToShow = (
      <div className="combined-result-layout">
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Output:</div>
          {resultOutput}
        </div>
        <div className="combined-result-section">
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Report:</div>
          <div className="combined-result-player">
            <Player
              key={replayCounter}
              replayScripts={replayScriptsInfo.scripts}
              imageWidth={replayScriptsInfo.width}
              imageHeight={replayScriptsInfo.height}
              reportFileContent={reportContent}
              fitMode={fitMode}
              autoZoom={autoZoom}
              canDownloadReport={
                canDownloadReport ?? serviceMode !== 'In-Browser'
              }
              onDownloadReport={onDownloadReport}
            />
          </div>
        </div>
      </div>
    );
  } else if (replayScriptsInfo) {
    // Has replay scripts (non-noReplayAPI) - show Player with replay and report
    const reportContent = result?.reportHTML || null;

    resultDataToShow = (
      <Player
        key={replayCounter}
        replayScripts={replayScriptsInfo.scripts}
        imageWidth={replayScriptsInfo.width}
        imageHeight={replayScriptsInfo.height}
        reportFileContent={reportContent}
        fitMode={fitMode}
        autoZoom={autoZoom}
        canDownloadReport={canDownloadReport ?? serviceMode !== 'In-Browser'}
        onDownloadReport={onDownloadReport}
      />
    );
  } else if (
    shouldPrioritizeResult &&
    result?.result !== undefined &&
    result?.reportHTML
  ) {
    // For data extraction APIs: show both result output and reportHTML
    const resultOutput =
      typeof result?.result === 'string' ? (
        <pre>{result?.result}</pre>
      ) : (
        <pre>{JSON.stringify(result?.result, null, 2)}</pre>
      );

    resultDataToShow = (
      <div className="combined-result-layout">
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Output:</div>
          {resultOutput}
        </div>
        <div className="combined-result-section">
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Report:</div>
          <div className="combined-result-player">
            <Player
              key={replayCounter}
              reportFileContent={result.reportHTML}
              fitMode={fitMode}
              autoZoom={autoZoom}
              canDownloadReport={
                canDownloadReport ?? serviceMode !== 'In-Browser'
              }
              onDownloadReport={onDownloadReport}
            />
          </div>
        </div>
      </div>
    );
  } else if (shouldPrioritizeResult && result?.result !== undefined) {
    // For data extraction APIs without reportHTML: show result output only
    resultDataToShow =
      typeof result?.result === 'string' ? (
        <pre>{result?.result}</pre>
      ) : (
        <pre>{JSON.stringify(result?.result, null, 2)}</pre>
      );
  } else if (result?.reportHTML) {
    // No replay scripts but has report - show Player with report only
    resultDataToShow = (
      <Player
        key={replayCounter}
        reportFileContent={result.reportHTML}
        fitMode={fitMode}
        autoZoom={autoZoom}
        canDownloadReport={canDownloadReport ?? serviceMode !== 'In-Browser'}
        onDownloadReport={onDownloadReport}
      />
    );
  } else if (result?.result !== undefined) {
    // Fallback: show result output
    resultDataToShow =
      typeof result?.result === 'string' ? (
        <pre>{result?.result}</pre>
      ) : (
        <pre>{JSON.stringify(result?.result, null, 2)}</pre>
      );
  }

  return (
    <div
      className={resultWrapperClassName}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        justifyContent: 'center',
      }}
    >
      {resultDataToShow}
    </div>
  );
};
