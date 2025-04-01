import { LoadingOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import type React from 'react';
import { Player } from '../player';
import type { ReplayScriptsInfo } from '../replay-scripts';
import { emptyResultTip, serverLaunchTip } from './playground-constants';
import type { PlaygroundResult as PlaygroundResultType } from './playground-types';
import type { ServiceModeType } from './playground-types';

interface PlaygroundResultProps {
  result: PlaygroundResultType | null;
  loading: boolean;
  serverValid: boolean;
  serviceMode: ServiceModeType;
  replayScriptsInfo: ReplayScriptsInfo | null;
  replayCounter: number;
  loadingProgressText: string;
  verticalMode?: boolean;
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
    resultDataToShow = serverLaunchTip;
  } else if (loading) {
    resultDataToShow = (
      <div className="loading-container">
        <Spin spinning={loading} indicator={<LoadingOutlined spin />} />
        <div className="loading-progress-text loading-progress-text-progress">
          {loadingProgressText}
        </div>
      </div>
    );
  } else if (replayScriptsInfo) {
    resultDataToShow = (
      <Player
        key={replayCounter}
        replayScripts={replayScriptsInfo.scripts}
        imageWidth={replayScriptsInfo.width}
        imageHeight={replayScriptsInfo.height}
        reportFileContent={
          serviceMode === 'In-Browser-Extension' && result?.reportHTML
            ? result?.reportHTML
            : null
        }
      />
    );
  } else if (result?.result) {
    resultDataToShow =
      typeof result?.result === 'string' ? (
        <pre>{result?.result}</pre>
      ) : (
        <pre>{JSON.stringify(result?.result, null, 2)}</pre>
      );
  } else if (result?.error) {
    resultDataToShow = <pre>{result?.error}</pre>;
  }

  return <div className={resultWrapperClassName}>{resultDataToShow}</div>;
};
