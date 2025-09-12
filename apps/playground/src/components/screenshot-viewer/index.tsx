import { ReloadOutlined } from '@ant-design/icons';
import type { PlaygroundSDK } from '@midscene/playground';
import { Button, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ScreenshotViewerProps {
  playgroundSDK: PlaygroundSDK;
  serverOnline: boolean;
  isUserOperating?: boolean; // Whether user is currently operating
}

export default function ScreenshotViewer({
  playgroundSDK,
  serverOnline,
  isUserOperating = false,
}: ScreenshotViewerProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [interfaceInfo, setInterfaceInfo] = useState<{
    type: string;
    description?: string;
  } | null>(null);

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
        const result = await playgroundSDK.getScreenshot();
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
    [playgroundSDK, serverOnline],
  );

  // Function to fetch interface info
  const fetchInterfaceInfo = useCallback(async () => {
    if (!serverOnline) return;

    try {
      const info = await playgroundSDK.getInterfaceInfo();
      if (info) {
        setInterfaceInfo(info);
      }
    } catch (err) {
      console.error('Interface info fetch error:', err);
    }
  }, [playgroundSDK, serverOnline]);

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

  // Manual refresh screenshot
  const handleManualRefresh = useCallback(() => {
    fetchScreenshot(true);
  }, [fetchScreenshot]);

  // Manage server connection status changes
  useEffect(() => {
    if (!serverOnline) {
      setScreenshot(null);
      setError(null);
      setInterfaceInfo(null);
      stopPolling();
      return;
    }

    // When server comes online, fetch screenshot and interface info immediately, then start polling
    fetchScreenshot(false);
    fetchInterfaceInfo();
    startPolling();

    return () => {
      stopPolling();
    };
  }, [
    serverOnline,
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

  if (loading && !screenshot) {
    return (
      <div className="screenshot-viewer loading">
        <Spin size="large" />
        <p>Loading screenshot...</p>
      </div>
    );
  }

  if (error && !screenshot) {
    return (
      <div className="screenshot-viewer error">
        <div className="screenshot-placeholder">
          <h3>📱 Screen Preview</h3>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  // 格式化时间显示
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
          <h3>
            {interfaceInfo?.type
              ? `📱 ${interfaceInfo.type}`
              : '📱 Screen Preview'}
          </h3>
          {interfaceInfo?.description && (
            <p className="screenshot-subtitle">{interfaceInfo.description}</p>
          )}
        </div>
        <div className="screenshot-controls">
          {lastUpdateTime > 0 && (
            <span className="last-update-time">
              Updated {formatLastUpdateTime(lastUpdateTime)}
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
      </div>
      <div className="screenshot-container">
        {screenshot ? (
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
  );
}
