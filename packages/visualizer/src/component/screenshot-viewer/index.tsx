import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import './index.less';

interface ScreenshotViewerProps {
  getScreenshot: () => Promise<{
    screenshot: string;
    timestamp: number;
  } | null>;
  getInterfaceInfo?: () => Promise<{
    type: string;
    description?: string;
  } | null>;
  serverOnline: boolean;
  isUserOperating?: boolean; // Whether user is currently operating
  mjpegUrl?: string; // When provided, use MJPEG live stream instead of polling
}

export default function ScreenshotViewer({
  getScreenshot,
  getInterfaceInfo,
  serverOnline,
  isUserOperating = false,
  mjpegUrl,
}: ScreenshotViewerProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [interfaceInfo, setInterfaceInfo] = useState<{
    type: string;
    description?: string;
  } | null>(null);
  // Key to force-reload the MJPEG <img> tag
  const [mjpegKey, setMjpegKey] = useState(0);

  const isMjpeg = Boolean(mjpegUrl && serverOnline);

  // Refs for managing polling
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingPausedRef = useRef(false);

  // Core function to fetch screenshot
  const fetchScreenshot = useCallback(
    async (isManual = false) => {
      if (!serverOnline) return;

      setLoading(true);
      if (isManual) setError(null); // Clear errors on manual refresh

      try {
        const result = await getScreenshot();
        console.log('Screenshot API response:', result); // Debug log

        if (result?.screenshot) {
          // Ensure screenshot is a valid string
          const screenshotData = result.screenshot.toString().trim();
          if (screenshotData) {
            // Screenshot data is already in full data URL format from createImgBase64ByFormat
            setScreenshot(screenshotData);
            setError(null); // Clear any previous errors
            setLastUpdateTime(Date.now());
          } else {
            setError('Empty screenshot data received');
          }
        } else {
          setError('No screenshot data in response');
        }
      } catch (err) {
        console.error('Screenshot fetch error:', err); // Debug log
        setError(
          err instanceof Error ? err.message : 'Failed to fetch screenshot',
        );
      } finally {
        setLoading(false);
      }
    },
    [getScreenshot, serverOnline],
  );

  // Function to fetch interface info
  const fetchInterfaceInfo = useCallback(async () => {
    if (!serverOnline || !getInterfaceInfo) return;

    try {
      const info = await getInterfaceInfo();
      if (info) {
        setInterfaceInfo(info);
      }
    } catch (err) {
      console.error('Interface info fetch error:', err);
    }
  }, [getInterfaceInfo, serverOnline]);

  // Start polling
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log('Starting screenshot polling (5s interval)');
    pollingIntervalRef.current = setInterval(() => {
      if (!isPollingPausedRef.current && serverOnline) {
        fetchScreenshot(false);
      }
    }, 5000); // 5 second polling
  }, [fetchScreenshot, serverOnline]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      console.log('Stopping screenshot polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Pause polling (don't clear interval, just mark as paused)
  const pausePolling = useCallback(() => {
    console.log('Pausing screenshot polling');
    isPollingPausedRef.current = true;
  }, []);

  // Resume polling
  const resumePolling = useCallback(() => {
    console.log('Resuming screenshot polling');
    isPollingPausedRef.current = false;
  }, []);

  // Manual refresh screenshot (or reload MJPEG stream)
  const handleManualRefresh = useCallback(() => {
    if (isMjpeg) {
      setMjpegKey((k) => k + 1);
    } else {
      fetchScreenshot(true);
    }
  }, [isMjpeg, fetchScreenshot]);

  // Manage server connection status changes
  useEffect(() => {
    if (!serverOnline) {
      setScreenshot(null);
      setError(null);
      setInterfaceInfo(null);
      stopPolling();
      return;
    }

    // Fetch interface info regardless of mode
    fetchInterfaceInfo();

    // In MJPEG mode, skip polling entirely
    if (isMjpeg) {
      stopPolling();
      return;
    }

    // When server comes online, fetch screenshot and interface info immediately, then start polling
    fetchScreenshot(false);
    startPolling();

    return () => {
      stopPolling();
    };
  }, [
    serverOnline,
    isMjpeg,
    startPolling,
    stopPolling,
    fetchScreenshot,
    fetchInterfaceInfo,
  ]);

  // Manage user operation status changes
  useEffect(() => {
    if (!serverOnline) return;

    if (isUserOperating) {
      // When user starts operating, pause polling
      pausePolling();
    } else {
      // When user operation ends, update screenshot immediately and resume polling
      resumePolling();
      fetchScreenshot(false);
    }
  }, [
    isUserOperating,
    pausePolling,
    resumePolling,
    fetchScreenshot,
    serverOnline,
  ]);

  // Cleanup function
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  if (!serverOnline) {
    return (
      <div className="screenshot-viewer offline">
        <div className="screenshot-placeholder">
          <h3>📱 Screen Preview</h3>
          <p>Start the playground server to see real-time screenshots</p>
        </div>
      </div>
    );
  }

  if (!isMjpeg && loading && !screenshot) {
    return (
      <div className="screenshot-viewer loading">
        <Spin size="large" />
        <p>Loading screenshot...</p>
      </div>
    );
  }

  if (!isMjpeg && error && !screenshot) {
    return (
      <div className="screenshot-viewer error">
        <div className="screenshot-placeholder">
          <h3>📱 Screen Preview</h3>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  const formatLastUpdateTime = (timestamp: number) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="screenshot-viewer">
      <div className="screenshot-header">
        <div className="screenshot-title">
          <h3>{interfaceInfo?.type ? interfaceInfo.type : 'Device Name'}</h3>
        </div>
      </div>
      <div className="screenshot-container">
        <div className="screenshot-overlay">
          <div className="device-name-overlay">
            Device Name
            <Tooltip title={interfaceInfo?.description}>
              <InfoCircleOutlined size={16} className="info-icon" />
            </Tooltip>
          </div>
          {!isMjpeg && (
            <div className="screenshot-controls">
              {lastUpdateTime > 0 && (
                <span className="last-update-time">
                  Last updated {formatLastUpdateTime(lastUpdateTime)}
                </span>
              )}
              <Tooltip title="Refresh screenshot">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={handleManualRefresh}
                  loading={loading}
                  size="small"
                />
              </Tooltip>
              {isUserOperating && (
                <span className="operation-indicator">
                  <Spin size="small" /> Operating...
                </span>
              )}
            </div>
          )}
        </div>
        <div className="screenshot-content">
          {isMjpeg ? (
            <img
              key={mjpegKey}
              src={mjpegUrl}
              alt="Device Live Stream"
              className="screenshot-image"
            />
          ) : screenshot ? (
            <img
              src={
                screenshot.startsWith('data:image/')
                  ? screenshot
                  : `data:image/png;base64,${screenshot}`
              }
              alt="Device Screenshot"
              className="screenshot-image"
              onLoad={() => console.log('Screenshot image loaded successfully')}
              onError={(e) => {
                console.error('Screenshot image load error:', e);
                console.error(
                  'Screenshot data preview:',
                  screenshot.substring(0, 100),
                );
                setError('Failed to load screenshot image');
              }}
            />
          ) : (
            <div className="screenshot-placeholder">
              <p>No screenshot available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
