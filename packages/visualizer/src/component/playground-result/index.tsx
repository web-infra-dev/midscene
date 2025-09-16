import { LoadingOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import type React from 'react';
import type { PlaygroundResult as PlaygroundResultType } from '../../types';
import type { ServiceModeType } from '../../types';
import type { ReplayScriptsInfo } from '../../utils/replay-scripts';
import { CodeDisplay } from '../code-display';
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
}) => {
  let resultWrapperClassName = 'result-wrapper';
  if (verticalMode) {
    resultWrapperClassName += ' vertical-mode-result';
  }
  if (replayScriptsInfo && verticalMode) {
    resultWrapperClassName += ' result-wrapper-compact';
  }

  let resultDataToShow: React.ReactNode = emptyResultTip;

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
  } else if (replayScriptsInfo) {
    // Check if we have code generation data to show alongside replay
    if (result?.generatedCode && result?.actionType) {
      resultDataToShow = (
        <div>
          <Player
            key={replayCounter}
            replayScripts={replayScriptsInfo.scripts}
            imageWidth={replayScriptsInfo.width}
            imageHeight={replayScriptsInfo.height}
            reportFileContent={
              (serviceMode === 'In-Browser-Extension' ||
                serviceMode === 'Server') &&
              result?.reportHTML
                ? result?.reportHTML
                : null
            }
            fitMode={fitMode}
            autoZoom={autoZoom}
          />
          <CodeDisplay
            generatedCode={result.generatedCode}
            decomposition={result.decomposition}
            actionType={result.actionType}
          />
        </div>
      );
    } else {
      resultDataToShow = (
        <Player
          key={replayCounter}
          replayScripts={replayScriptsInfo.scripts}
          imageWidth={replayScriptsInfo.width}
          imageHeight={replayScriptsInfo.height}
          reportFileContent={
            (serviceMode === 'In-Browser-Extension' ||
              serviceMode === 'Server') &&
            result?.reportHTML
              ? result?.reportHTML
              : null
          }
          fitMode={fitMode}
          autoZoom={autoZoom}
        />
      );
    }
  } else if (result?.error) {
    resultDataToShow = <pre>{result?.error}</pre>;
  } else if (result?.result !== undefined) {
    const originalResult =
      typeof result?.result === 'string' ? (
        <pre>{result?.result}</pre>
      ) : (
        <pre>{JSON.stringify(result?.result, null, 2)}</pre>
      );

    // Show code generation if available (for non-chat interfaces like report app)
    console.log('[DEBUG] PlaygroundResult - checking code generation:', {
      hasGeneratedCode: !!result?.generatedCode,
      hasActionType: !!result?.actionType,
      hasDecomposition: !!result?.decomposition,
      actionType: result?.actionType,
      generatedCode: result?.generatedCode,
      decomposition: result?.decomposition,
    });

    if (result?.generatedCode && result?.actionType) {
      resultDataToShow = (
        <div>
          {originalResult}
          <CodeDisplay
            generatedCode={result.generatedCode}
            decomposition={result.decomposition}
            actionType={result.actionType}
          />
        </div>
      );
    } else {
      resultDataToShow = originalResult;
    }
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
