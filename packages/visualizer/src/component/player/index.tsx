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
  LoadingOutlined,
  PauseOutlined,
  ThunderboltOutlined,
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
    return calculateFrameMap(scripts);
  }, [scripts]);

  const playerRef = useRef<PlayerRef>(null);
  const lastTaskIdRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const markerHoverIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Override Remotion Player seek bar styles via DOM
  useEffect(() => {
    const node = (playerRef.current as any)?.getContainerNode?.();
    if (!node) return;

    const applySeekBarStyles = () => {
      // Find seek bar container (has cursor: pointer and touch-action: none)
      const seekBarContainer = node.querySelector(
        '[style*="touch-action"]',
      ) as HTMLElement | null;
      if (!seekBarContainer) return;

      // Bar background: first child of seek bar container
      const barBg = seekBarContainer.firstElementChild as HTMLElement | null;
      if (barBg) {
        barBg.style.setProperty(
          'background-color',
          'rgba(255, 255, 255, 0.3)',
          'important',
        );
      }

      // Fill bar: last child of bar background
      const fillBar = barBg?.lastElementChild as HTMLElement | null;
      if (fillBar) {
        fillBar.style.setProperty(
          'background-color',
          'rgba(43, 131, 255, 1)',
          'important',
        );
      }

      // Knob: last child of seek bar container
      const knob = seekBarContainer.lastElementChild as HTMLElement | null;
      if (knob && knob !== barBg) {
        knob.style.setProperty('opacity', '1', 'important');
        knob.style.setProperty('background-color', '#fff', 'important');
        knob.style.setProperty('box-shadow', 'none', 'important');
        knob.style.setProperty('width', '8px', 'important');
        knob.style.setProperty('height', '16px', 'important');
        knob.style.setProperty('border-radius', '10px', 'important');
        // Vertically center: bar center at 6.5px from container top, knob height 16
        knob.style.setProperty('top', '-1.5px', 'important');
      }

      // Sync chapter markers visibility with control bar
      const controlBar = node.querySelector(
        '[style*="transition"]',
      ) as HTMLElement | null;
      const markersEl = wrapperRef.current?.querySelector(
        '.chapter-markers',
      ) as HTMLElement | null;
      if (controlBar && markersEl) {
        markersEl.style.opacity = window.getComputedStyle(controlBar).opacity;
      }
    };

    // Apply initially and observe for re-renders
    const timer = setInterval(applySeekBarStyles, 300);
    applySeekBarStyles();
    return () => clearInterval(timer);
  }, [frameMap]);

  // Continuously dispatch mousemove on Remotion Player root to keep controls visible
  // Remotion uses mouseenter/mouseleave/mousemove to track hover state,
  // and hides controls after a timeout with no mouse activity
  const onMarkerMouseEnter = useCallback(() => {
    const node = (playerRef.current as any)?.getContainerNode?.();
    if (!node) return;
    const dispatchMove = () => {
      node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      node.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    };
    dispatchMove();
    markerHoverIntervalRef.current = setInterval(dispatchMove, 200);
  }, []);
  const onMarkerMouseLeave = useCallback(() => {
    if (markerHoverIntervalRef.current) {
      clearInterval(markerHoverIntervalRef.current);
      markerHoverIntervalRef.current = null;
    }
  }, []);

  // Track frame for taskId callback
  useEffect(() => {
    if (!frameMap || !props?.onTaskChange) return;
    lastTaskIdRef.current = null;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const frame = player.getCurrentFrame() ?? 0;
      const taskId = deriveTaskId(frameMap.scriptFrames, frame);
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

  const renderPlayPauseButton: RenderPlayPauseButton = useCallback(
    ({ playing, isBuffering }) => (
      <div className="status-icon">
        {isBuffering ? (
          <LoadingOutlined spin />
        ) : playing ? (
          <PauseOutlined />
        ) : (
          <CaretRightOutlined />
        )}
      </div>
    ),
    [],
  );

  const renderFullscreenButton: RenderFullscreenButton = useCallback(
    ({ isFullscreen }) => (
      <div className="status-icon">
        {isFullscreen ? <CompressOutlined /> : <ExpandOutlined />}
      </div>
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
                  <FontSizeOutlined style={{ width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '12px', marginRight: '16px' }}>
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
            </div>
          )}
          menu={{ items: [] }}
        >
          <div className="status-icon">
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
    subtitleEnabled,
    setSubtitleEnabled,
  ]);

  // Compute chapter markers from step boundaries (each img/insight = new chapter)
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

  const imgW = frameMap.imageWidth;
  const imgH = frameMap.imageHeight;
  const isPortraitImage = imgH > imgW;

  // For portrait devices, always use a landscape canvas
  // so the phone / content is shown centered with readable subtitles
  const compositionWidth = isPortraitImage ? Math.round((imgH * 4) / 3) : imgW;
  const compositionHeight = imgH;
  const isPortraitCanvas = compositionHeight > compositionWidth;

  return (
    <div className="player-container" data-fit-mode={props?.fitMode}>
      <div className="canvas-container">
        <div
          className="player-wrapper"
          ref={wrapperRef}
          data-portrait={isPortraitCanvas ? '' : undefined}
          style={{
            aspectRatio: `${compositionWidth}/${compositionHeight}`,
          }}
        >
          <RemotionPlayer
            ref={playerRef}
            component={Composition}
            inputProps={{
              frameMap,
              autoZoom,
              subtitleEnabled,
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
            acknowledgeRemotionLicense
            style={{
              width: '100%',
              height: '100%',
              zIndex: 0,
            }}
          />

          {/* Chapter markers overlay on Remotion's seek bar */}
          {chapterMarkers.length > 0 && (
            <div className="chapter-markers">
              {chapterMarkers.map((marker) => (
                <Tooltip
                  key={marker.percent}
                  title={marker.title}
                  overlayClassName="chapter-tooltip"
                >
                  <div
                    className="chapter-marker"
                    style={{ left: `${marker.percent}%` }}
                    onMouseEnter={onMarkerMouseEnter}
                    onMouseLeave={onMarkerMouseLeave}
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
