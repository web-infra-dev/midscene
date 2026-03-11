'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './index.less';
import {
  CaretRightOutlined,
  CompressOutlined,
  DownloadOutlined,
  ExpandOutlined,
  ExportOutlined,
  FontSizeOutlined,
  PauseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Dropdown, Spin, Switch, Tooltip, message } from 'antd';
import GlobalPerspectiveIcon from '../../icons/global-perspective.svg';
import PlayerSettingIcon from '../../icons/player-setting.svg';
import { type PlaybackSpeedType, useGlobalPreference } from '../../store/store';
import type { AnimationScript } from '../../utils/replay-scripts';
import { StepsTimeline } from './scenes/StepScene';
import { exportBrandedVideo } from './scenes/export-branded-video';
import { calculateFrameMap } from './scenes/frame-calculator';
import type { FrameMap, ScriptFrame } from './scenes/frame-calculator';
import { getPlaybackFrameState } from './scenes/playback-frame';
import { useFramePlayer } from './use-frame-player';

const downloadReport = (content: string): void => {
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'midscene_report.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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

function formatTime(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
}) {
  const {
    autoZoom,
    setAutoZoom,
    playbackSpeed,
    setPlaybackSpeed,
    subtitleEnabled,
    setSubtitleEnabled,
  } = useGlobalPreference();

  useEffect(() => {
    if (props?.autoZoom !== undefined) {
      setAutoZoom(props.autoZoom);
    }
  }, [props?.autoZoom, setAutoZoom]);

  const scripts = props?.replayScripts;
  const frameMap = useMemo<FrameMap | null>(() => {
    if (!scripts || scripts.length === 0) return null;
    return calculateFrameMap(scripts, {
      imageWidth: props?.imageWidth,
      imageHeight: props?.imageHeight,
    });
  }, [props?.imageHeight, props?.imageWidth, scripts]);

  const containerRef = useRef<HTMLDivElement>(null);
  const renderLayerRef = useRef<HTMLDivElement>(null);
  const lastTaskIdRef = useRef<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Observe render layer size to compute scale factor
  useEffect(() => {
    const el = renderLayerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize((prev) =>
          prev.width === width && prev.height === height
            ? prev
            : { width, height },
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const player = useFramePlayer({
    durationInFrames: Math.max(frameMap?.totalDurationInFrames ?? 1, 1),
    fps: frameMap?.fps ?? 30,
    autoPlay: true,
    loop: false,
    playbackRate: playbackSpeed,
  });

  // Track frame for taskId callback
  useEffect(() => {
    if (!frameMap || !props?.onTaskChange) return;
    const taskId = deriveTaskId(frameMap.scriptFrames, player.currentFrame);
    if (taskId !== lastTaskIdRef.current) {
      lastTaskIdRef.current = taskId;
      props.onTaskChange(taskId);
    }
  }, [frameMap, props?.onTaskChange, player.currentFrame]);

  const currentFrameState = useMemo(() => {
    if (!frameMap) return null;
    return getPlaybackFrameState(frameMap, player.currentFrame);
  }, [frameMap, player.currentFrame]);

  const subtitle = useMemo(() => {
    if (!currentFrameState) return null;
    if (!currentFrameState.title && !currentFrameState.subTitle) return null;
    return {
      title: currentFrameState.title,
      subTitle: currentFrameState.subTitle,
    };
  }, [currentFrameState]);

  // Controls auto-hide
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  const onMouseEnter = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const onMouseLeave = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 1000);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.code === 'Space') {
        e.preventDefault();
        player.toggle();
      }
    },
    [player],
  );

  // Seek bar drag
  const seekBarRef = useRef<HTMLDivElement>(null);
  const handleSeekPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!frameMap || !seekBarRef.current) return;
      const bar = seekBarRef.current;
      bar.setPointerCapture(e.pointerId);

      const seek = (clientX: number) => {
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (clientX - rect.left) / rect.width),
        );
        player.seekTo(Math.round(ratio * (frameMap.totalDurationInFrames - 1)));
      };

      seek(e.clientX);

      const onMove = (ev: PointerEvent) => seek(ev.clientX);
      const onUp = () => {
        bar.removeEventListener('pointermove', onMove);
        bar.removeEventListener('pointerup', onUp);
      };
      bar.addEventListener('pointermove', onMove);
      bar.addEventListener('pointerup', onUp);
    },
    [frameMap, player],
  );

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Export video
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleExportVideo = useCallback(async () => {
    if (!frameMap || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      await exportBrandedVideo(frameMap, (pct) =>
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
  }, [frameMap, isExporting]);

  // Compute chapter markers
  const chapterMarkers = useMemo(() => {
    if (!frameMap) return [];
    const { scriptFrames, totalDurationInFrames } = frameMap;
    if (totalDurationInFrames === 0) return [];

    const markers: { percent: number; title: string; frame: number }[] = [];
    for (const sf of scriptFrames) {
      if (
        (sf.type !== 'img' && sf.type !== 'insight') ||
        sf.durationInFrames === 0
      )
        continue;
      const globalFrame = sf.startFrame;
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

  const compositionWidth = currentFrameState?.imageWidth || frameMap.imageWidth;
  const compositionHeight =
    currentFrameState?.imageHeight || frameMap.imageHeight;
  const isPortraitCanvas = compositionHeight > compositionWidth;

  const totalFrames = frameMap.totalDurationInFrames;
  const seekPercent =
    totalFrames > 1 ? (player.currentFrame / (totalFrames - 1)) * 100 : 0;

  return (
    <div className="player-container" data-fit-mode={props?.fitMode}>
      <div
        className="canvas-container"
        ref={containerRef}
        onKeyDown={handleKeyDown}
        onMouseMove={showControls}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div
          className="player-wrapper"
          data-portrait={isPortraitCanvas ? '' : undefined}
          style={{
            aspectRatio: `${compositionWidth}/${compositionHeight}`,
          }}
        >
          {/* Render layer — renders at native resolution, scaled to fit & centered */}
          <div
            ref={renderLayerRef}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
            onClick={player.toggle}
          >
            {(() => {
              const scale =
                containerSize.width > 0 && containerSize.height > 0
                  ? Math.min(
                      containerSize.width / compositionWidth,
                      containerSize.height / compositionHeight,
                    )
                  : 1;
              return (
                <div
                  style={{
                    width: compositionWidth * scale,
                    height: compositionHeight * scale,
                    flexShrink: 0,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: compositionWidth,
                      height: compositionHeight,
                      transformOrigin: '0 0',
                      transform: `scale(${scale})`,
                    }}
                  >
                    <StepsTimeline
                      frameMap={frameMap}
                      autoZoom={autoZoom}
                      frame={player.currentFrame}
                      width={compositionWidth}
                      height={compositionHeight}
                      fps={frameMap.fps}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Subtitle — rendered in display coordinates, outside scaled content */}
        {subtitleEnabled && subtitle && (
          <div className="player-subtitle">
            {subtitle.title && (
              <span className="player-subtitle-badge">{subtitle.title}</span>
            )}
            {subtitle.subTitle && (
              <span className="player-subtitle-text">{subtitle.subTitle}</span>
            )}
          </div>
        )}

        {/* Control bar */}
        <div
          className={`control-bar ${controlsVisible ? '' : 'hidden'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="status-icon" onClick={player.toggle}>
            {player.playing ? <PauseOutlined /> : <CaretRightOutlined />}
          </div>

          <span className="time-display">
            {formatTime(player.currentFrame, frameMap.fps)} /{' '}
            {formatTime(totalFrames, frameMap.fps)}
          </span>

          <div
            className="seek-bar-track"
            ref={seekBarRef}
            onPointerDown={handleSeekPointerDown}
          >
            <div
              className="seek-bar-fill"
              style={{ width: `${seekPercent}%` }}
            />
            <div
              className="seek-bar-knob"
              style={{ left: `${seekPercent}%` }}
            />
            {chapterMarkers.map((marker) => (
              <Tooltip
                key={marker.percent}
                title={marker.title}
                overlayClassName="chapter-tooltip"
              >
                <div
                  className="chapter-marker"
                  style={{ left: `${marker.percent}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    player.seekTo(marker.frame);
                  }}
                />
              </Tooltip>
            ))}
          </div>

          {/* Custom controls */}
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
                      <Spin size="small" />
                    ) : (
                      <ExportOutlined
                        style={{ width: '16px', height: '16px' }}
                      />
                    )}
                    <span style={{ fontSize: '14px' }}>
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
                      <span style={{ fontSize: '14px', marginRight: '16px' }}>
                        Focus on cursor
                      </span>
                    </div>
                    <Switch
                      size="small"
                      checked={autoZoom}
                      onChange={(checked) => setAutoZoom(checked)}
                    />
                  </div>

                  {/* Subtitle toggle */}
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
                      <FontSizeOutlined
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '14px', marginRight: '16px' }}>
                        Subtitle
                      </span>
                    </div>
                    <Switch
                      size="small"
                      checked={subtitleEnabled}
                      onChange={(checked) => setSubtitleEnabled(checked)}
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
                    <span style={{ fontSize: '14px' }}>Playback speed</span>
                  </div>
                  {([0.5, 1, 1.5, 2] as PlaybackSpeedType[]).map((speed) => (
                    <div
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      style={{
                        height: '32px',
                        lineHeight: '32px',
                        padding: '0 8px 0 24px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                      }}
                      className={`player-speed-option${playbackSpeed === speed ? ' active' : ''}`}
                    >
                      {speed}x
                    </div>
                  ))}
                </div>
              )}
              menu={{ items: [] }}
            >
              <div className="status-icon">
                <PlayerSettingIcon style={{ width: '16px', height: '16px' }} />
              </div>
            </Dropdown>

            <div className="status-icon" onClick={toggleFullscreen}>
              {isFullscreen ? <CompressOutlined /> : <ExpandOutlined />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
