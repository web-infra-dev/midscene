import { LoadingOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import type React from 'react';
import { Player } from '../player';
import type { ReplayScriptsInfo } from '../replay-scripts';
import ShinyText from '../shiny-text';
import { emptyResultTip, serverLaunchTip } from './playground-constants';
import type { PlaygroundResult as PlaygroundResultType } from './playground-types';
import type { ServiceModeType } from './playground-types';

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

  return (
    <div
      className={resultWrapperClassName}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
      }}
    >
      {resultDataToShow}
    </div>
  );
};
