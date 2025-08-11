import { Card, Button, Space, Typography, message, Tooltip } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import './index.less';

const { Text } = Typography;

export interface IOSPlayerRefMethods {
    refreshDisplay: () => Promise<void>;
}

interface IOSPlayerProps {
    serverUrl?: string;
    autoConnect?: boolean;
}

const IOSPlayer = forwardRef<IOSPlayerRefMethods, IOSPlayerProps>(
    ({ serverUrl = 'http://localhost:1412', autoConnect = false }, ref) => {
        const [connected, setConnected] = useState(false);
        const [autoDetecting, setAutoDetecting] = useState(false);
        const [messageApi, contextHolder] = message.useMessage();
        const [mirrorConfig, setMirrorConfig] = useState<any>(null);

        // Helper function to get the appropriate URL for API calls
        const getApiUrl = (endpoint: string) => {
            // In development, use proxy; in production or when server is not localhost:1412, use direct URL
            if (serverUrl === 'http://localhost:1412' && process.env.NODE_ENV === 'development') {
                return `/api/pyautogui${endpoint}`;
            }
            return `${serverUrl}${endpoint}`;
        };

        const checkConnection = async () => {
            try {
                const response = await fetch(getApiUrl('/health'));
                const isConnected = response.ok;
                setConnected(isConnected);

                // If connected, also get the current config
                if (isConnected) {
                    try {
                        const configResponse = await fetch(getApiUrl('/config'));
                        const configResult = await configResponse.json();
                        if (configResult.status === 'ok') {
                            setMirrorConfig(configResult.config);
                        }
                    } catch (error) {
                        // Ignore config fetch errors
                        console.warn('Failed to fetch config:', error);
                    }
                }

                return isConnected;
            } catch (error) {
                setConnected(false);
                setMirrorConfig(null);
                return false;
            }
        };

        const autoDetectMirror = async () => {
            if (!connected) {
                messageApi.warning('Server is not connected');
                return;
            }

            setAutoDetecting(true);
            try {
                const response = await fetch(getApiUrl('/detect'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });

                const result = await response.json();
                if (result.status === 'ok') {
                    messageApi.success(`Auto-configured: ${result.message}`);
                    setMirrorConfig(result.config);
                } else {
                    messageApi.error(`Auto-detection failed: ${result.error}`);
                    if (result.suggestion) {
                        messageApi.info(result.suggestion);
                    }
                }
            } catch (error) {
                messageApi.error(`Auto-detection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            } finally {
                setAutoDetecting(false);
            }
        };

        useImperativeHandle(ref, () => ({
            refreshDisplay: async () => {
                // Just refresh the connection status
                await checkConnection();
            },
        }));

        useEffect(() => {
            checkConnection();
            const interval = setInterval(checkConnection, 3000);
            return () => clearInterval(interval);
        }, [serverUrl]);

        useEffect(() => {
            if (autoConnect && connected) {
                // Try auto-detection when connected
                autoDetectMirror();
            }
        }, [autoConnect, connected]);

        return (
            <div className="ios-player-container">
                {contextHolder}
                <Card
                    title={
                        <Space>
                            <Text strong>iOS Display</Text>
                            {connected && (
                                <Space size="small">
                                    <Tooltip title="Auto-detect iPhone Mirroring window">
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<SearchOutlined />}
                                            loading={autoDetecting}
                                            onClick={autoDetectMirror}
                                        >
                                            Auto Detect
                                        </Button>
                                    </Tooltip>
                                </Space>
                            )}
                        </Space>
                    }
                    size="small"
                >
                    {connected && mirrorConfig && mirrorConfig.enabled && (
                        <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '4px' }}>
                            <Text style={{ fontSize: '12px', color: '#52c41a' }}>
                                ✅ Configured: {mirrorConfig.estimated_ios_width}×{mirrorConfig.estimated_ios_height} device
                                → {mirrorConfig.mirror_width}×{mirrorConfig.mirror_height} at ({mirrorConfig.mirror_x}, {mirrorConfig.mirror_y})
                            </Text>
                        </div>
                    )}

                    <div className="display-area">
                        {!connected ? (
                            <div className="placeholder">
                                <Text type="secondary">
                                    Waiting for iOS device connection...
                                    <br />
                                    Please ensure iPhone Mirroring is active
                                </Text>
                            </div>
                        ) : (
                            <div className="placeholder">
                                <Text type="secondary">
                                    iOS device connected. Use Auto Detect to configure mirroring.
                                </Text>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        );
    }
);

IOSPlayer.displayName = 'IOSPlayer';

export default IOSPlayer;
