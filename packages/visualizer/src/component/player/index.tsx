'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './index.less';
import {
  CaretRightOutlined,
  CompressOutlined,
  DownloadOutlined,
  ExpandOutlined,
  ExportOutlined,
  LoadingOutlined,
  PauseOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { Player as RemotionPlayer } from '@remotion/player';
import type {
  PlayerRef,
  RenderCustomControls,
  RenderFullscreenButton,
  RenderPlayPauseButton,
} from '@remotion/player';
import { Dropdown, Spin, Switch, Tooltip, message } from 'antd';
import GlobalPerspectiveIcon from '../../icons/global-perspective.svg';
import PlayerSettingIcon from '../../icons/player-setting.svg';
import { type PlaybackSpeedType, useGlobalPreference } from '../../store/store';
import type { AnimationScript } from '../../utils/replay-scripts';
import { Composition } from './remotion/BrandedComposition';
import { exportBrandedVideo } from './remotion/export-branded-video';
import { calculateFrameMap } from './remotion/frame-calculator';
import type { FrameMap, ScriptFrame } from './remotion/frame-calculator';

const downloadReport = (content: string): void => {
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'midscene_report.html';
  a.click();
  URL.revokeObjectURL(url);
};

function deriveTaskId(
  scriptFrames: ScriptFrame[],
  stepsFrame: number,
): string | null {
  let taskId: string | null = null;
  for (const sf of scriptFrames) {
    if (sf.durationInFrames === 0) {
      if (sf.startFrame <= stepsFrame) {
        taskId = sf.taskId ?? taskId;
      }
      continue;
    }
    if (stepsFrame < sf.startFrame) break;
    taskId = sf.taskId ?? taskId;
  }
  return taskId;
}

export function Player(props?: {
  replayScripts?: AnimationScript[];
  imageWidth?: number;
  imageHeight?: number;
  reportFileContent?: string | null;
  key?: string | number;
  fitMode?: 'width' | 'height';
  autoZoom?: boolean;
  canDownloadReport?: boolean;
  onTaskChange?: (taskId: string | null) => void;
  deviceType?: string;
}) {
  const {
    autoZoom,
    setAutoZoom,
    playbackSpeed,
    setPlaybackSpeed,
    effectsEnabled,
    setEffectsEnabled,
  } = useGlobalPreference();

  useEffect(() => {
    if (props?.autoZoom !== undefined) {
      setAutoZoom(props.autoZoom);
    }
  }, [props?.autoZoom, setAutoZoom]);

  const scripts = props?.replayScripts;
  const deviceType = props?.deviceType;
  const frameMap = useMemo<FrameMap | null>(() => {
    if (!scripts || scripts.length === 0) return null;
    return calculateFrameMap(scripts, {
      effects: effectsEnabled,
      deviceType,
    });
  }, [scripts, effectsEnabled, deviceType]);

  const playerRef = useRef<PlayerRef>(null);
  const lastTaskIdRef = useRef<string | null>(null);

  // Track frame for taskId callback
  useEffect(() => {
    if (!frameMap || !props?.onTaskChange) return;
    lastTaskIdRef.current = null;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const frame = player.getCurrentFrame() ?? 0;
      const stepsFrame = frame - frameMap.openingDurationInFrames;
      const taskId =
        stepsFrame >= 0
          ? deriveTaskId(frameMap.scriptFrames, stepsFrame)
          : null;
      if (taskId !== lastTaskIdRef.current) {
        lastTaskIdRef.current = taskId;
        props.onTaskChange!(taskId);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [frameMap, props?.onTaskChange]);

  // Export video
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleExportVideo = useCallback(async () => {
    if (!frameMap || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      await exportBrandedVideo(frameMap, effectsEnabled, (pct) =>
        setExportProgress(Math.round(pct * 100)),
      );
      message.success('Video exported');
    } catch (e) {
      console.error('Export failed:', e);
      message.error('Export failed');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [frameMap, effectsEnabled, isExporting]);

  const [mouseOverSettingsIcon, setMouseOverSettingsIcon] = useState(false);

  const renderPlayPauseButton: RenderPlayPauseButton = useCallback(
    ({ playing, isBuffering }) => {
      if (isBuffering)
        return <LoadingOutlined spin style={{ color: '#fff' }} />;
      return playing ? (
        <PauseOutlined style={{ color: '#fff' }} />
      ) : (
        <CaretRightOutlined style={{ color: '#fff' }} />
      );
    },
    [],
  );

  const renderFullscreenButton: RenderFullscreenButton = useCallback(
    ({ isFullscreen }) =>
      isFullscreen ? (
        <CompressOutlined style={{ color: '#fff' }} />
      ) : (
        <ExpandOutlined style={{ color: '#fff' }} />
      ),
    [],
  );

  const renderCustomControls: RenderCustomControls = useCallback(() => {
    return (
      <div className="player-custom-controls">
        {props?.reportFileContent && props?.canDownloadReport !== false ? (
          <Tooltip title="Download Report">
            <div
              className="status-icon"
              onClick={() => downloadReport(props.reportFileContent!)}
            >
              <DownloadOutlined />
            </div>
          </Tooltip>
        ) : null}

        <Dropdown
          trigger={['hover', 'click']}
          placement="topRight"
          overlayStyle={{ minWidth: '148px' }}
          dropdownRender={() => (
            <div className="player-settings-dropdown">
              {/* Export video */}
              <div
                className="player-settings-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: '4px',
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  opacity: isExporting ? 0.5 : 1,
                }}
                onClick={isExporting ? undefined : handleExportVideo}
              >
                {isExporting ? (
                  <Spin size="small" percent={exportProgress} />
                ) : (
                  <ExportOutlined style={{ width: '16px', height: '16px' }} />
                )}
                <span style={{ fontSize: '12px' }}>
                  {isExporting
                    ? `Exporting ${exportProgress}%`
                    : 'Export video'}
                </span>
              </div>

              <div className="player-settings-divider" />

              {/* Focus on cursor toggle */}
              <div
                className="player-settings-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: '4px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <GlobalPerspectiveIcon
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '12px', marginRight: '16px' }}>
                    Focus on cursor
                  </span>
                </div>
                <Switch
                  size="small"
                  checked={autoZoom}
                  onChange={(checked) => setAutoZoom(checked)}
                />
              </div>

              <div className="player-settings-divider" />

              {/* Playback speed */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '32px',
                  padding: '0 8px',
                }}
              >
                <ThunderboltOutlined
                  style={{ width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '12px' }}>Playback speed</span>
              </div>
              {([0.5, 1, 1.5, 2] as PlaybackSpeedType[]).map((speed) => (
                <div
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  style={{
                    height: '32px',
                    lineHeight: '32px',
                    padding: '0 8px 0 24px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                  }}
                  className={`player-speed-option${playbackSpeed === speed ? ' active' : ''}`}
                >
                  {speed}x
                </div>
              ))}

              <div className="player-settings-divider" />

              {/* Effects toggle */}
              <div
                className="player-settings-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: '4px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <VideoCameraOutlined
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '12px', marginRight: '16px' }}>
                    Effects
                  </span>
                </div>
                <Switch
                  size="small"
                  checked={effectsEnabled}
                  onChange={(checked) => setEffectsEnabled(checked)}
                />
              </div>
            </div>
          )}
          menu={{ items: [] }}
        >
          <div
            className="status-icon"
            onMouseEnter={() => setMouseOverSettingsIcon(true)}
            onMouseLeave={() => setMouseOverSettingsIcon(false)}
            style={{
              opacity: mouseOverSettingsIcon ? 1 : 0.7,
              transition: 'opacity 0.2s',
            }}
          >
            <PlayerSettingIcon style={{ width: '16px', height: '16px' }} />
          </div>
        </Dropdown>
      </div>
    );
  }, [
    props?.reportFileContent,
    props?.canDownloadReport,
    isExporting,
    exportProgress,
    handleExportVideo,
    autoZoom,
    setAutoZoom,
    playbackSpeed,
    setPlaybackSpeed,
    effectsEnabled,
    setEffectsEnabled,
    mouseOverSettingsIcon,
  ]);

  // Compute chapter markers from step boundaries (each img/insight = new chapter)
  const chapterMarkers = useMemo(() => {
    if (!frameMap) return [];
    const { scriptFrames, totalDurationInFrames, openingDurationInFrames } =
      frameMap;
    if (totalDurationInFrames === 0) return [];

    const markers: { percent: number; title: string; frame: number }[] = [];
    for (const sf of scriptFrames) {
      if (
        (sf.type !== 'img' && sf.type !== 'insight') ||
        sf.durationInFrames === 0
      )
        continue;
      const globalFrame = openingDurationInFrames + sf.startFrame;
      const percent = (globalFrame / totalDurationInFrames) * 100;
      if (percent > 1 && percent < 99) {
        const parts = [sf.title, sf.subTitle].filter(Boolean);
        markers.push({
          percent,
          title:
            parts.length > 0
              ? parts.join(': ')
              : `Chapter ${markers.length + 1}`,
          frame: globalFrame,
        });
      }
    }
    return markers;
  }, [frameMap]);

  // If no scripts, show empty
  if (!scripts || scripts.length === 0 || !frameMap) {
    return <div className="player-container" />;
  }

  const compositionWidth = frameMap.imageWidth;
  const compositionHeight = frameMap.imageHeight;

  return (
    <div className="player-container" data-fit-mode={props?.fitMode}>
      <div className="canvas-container">
        <div className="player-wrapper">
          <RemotionPlayer
            ref={playerRef}
            component={Composition}
            inputProps={{
              frameMap,
              effects: effectsEnabled,
              autoZoom,
            }}
            durationInFrames={Math.max(frameMap.totalDurationInFrames, 1)}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            fps={frameMap.fps}
            playbackRate={playbackSpeed}
            controls
            showVolumeControls={false}
            renderPlayPauseButton={renderPlayPauseButton}
            renderFullscreenButton={renderFullscreenButton}
            renderCustomControls={renderCustomControls}
            autoPlay
            loop={false}
            style={{
              width: '100%',
              aspectRatio: `${compositionWidth}/${compositionHeight}`,
              zIndex: 0,
            }}
          />

          {/* Chapter markers overlay on Remotion's seek bar */}
          {chapterMarkers.length > 0 && (
            <div className="chapter-markers">
              {chapterMarkers.map((marker) => (
                <Tooltip key={marker.percent} title={marker.title}>
                  <div
                    className="chapter-marker"
                    style={{ left: `${marker.percent}%` }}
                    onClick={() => {
                      playerRef.current?.seekTo(marker.frame);
                    }}
                  />
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
