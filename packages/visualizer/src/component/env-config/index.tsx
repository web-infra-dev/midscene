import { SettingOutlined } from '@ant-design/icons';
import type { ConnectivityTestResult } from '@midscene/core';
import { Alert, Button, Input, Modal, Tooltip, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useEnvConfig } from '../../store/store';
import type { PlaygroundSDKLike } from '../../types';

export function EnvConfig({
  showTooltipWhenEmpty = true,
  showModelName = true,
  tooltipPlacement = 'bottom',
  mode = 'icon',
  playgroundSDK,
}: {
  showTooltipWhenEmpty?: boolean;
  showModelName?: boolean;
  tooltipPlacement?: 'bottom' | 'top';
  mode?: 'icon' | 'text';
  playgroundSDK?: PlaygroundSDKLike | null;
}) {
  const { config, configString, loadConfig, syncFromStorage } = useEnvConfig();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempConfigString, setTempConfigString] = useState(configString);
  const [connectivityResult, setConnectivityResult] =
    useState<ConnectivityTestResult | null>(null);
  const [connectivityLoading, setConnectivityLoading] = useState(false);
  const midsceneModelName = config.MIDSCENE_MODEL_NAME;
  const canRunConnectivityTest =
    !!playgroundSDK?.runConnectivityTest && !!playgroundSDK?.overrideConfig;
  const componentRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const showModal = (e: React.MouseEvent) => {
    // every time open modal, sync from localStorage
    syncFromStorage();

    clearCloseTimer();
    setIsModalOpen(true);
    e.preventDefault();
    e.stopPropagation();
  };

  const handleOk = () => {
    clearCloseTimer();
    setIsModalOpen(false);
    loadConfig(tempConfigString);
  };

  const handleSaveAndRun = async () => {
    const sdk = playgroundSDK;

    if (!sdk?.overrideConfig || !sdk?.runConnectivityTest) {
      return;
    }

    try {
      setConnectivityLoading(true);
      setConnectivityResult(null);
      loadConfig(tempConfigString);
      const nextConfig = useEnvConfig.getState().config;
      await sdk.overrideConfig(nextConfig);
      const result = await sdk.runConnectivityTest();
      setConnectivityResult(result);
      if (result.passed) {
        message.success('Model verification passed');
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(() => {
          setIsModalOpen(false);
          closeTimerRef.current = null;
        }, 2000);
      } else {
        message.warning('Model verification found issues');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      message.error(`Model verification failed: ${errorMessage}`);
      setConnectivityResult({
        passed: false,
        checks: [
          {
            name: 'text',
            intent: 'default',
            modelName: useEnvConfig.getState().config.MIDSCENE_MODEL_NAME || '',
            modelFamily: undefined,
            passed: false,
            durationMs: 0,
            message: errorMessage,
          },
        ],
      });
    } finally {
      setConnectivityLoading(false);
    }
  };

  const handleCancel = () => {
    clearCloseTimer();
    setIsModalOpen(false);
  };

  // when modal is open, use the latest config string
  useEffect(() => {
    if (isModalOpen) {
      setTempConfigString(configString);
      setConnectivityResult(null);
    }
  }, [isModalOpen, configString]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        alignItems: 'center',
        height: '100%',
        minHeight: '32px',
      }}
      ref={componentRef}
    >
      {showModelName ? midsceneModelName : null}
      <Tooltip
        title="Please set up your environment variables before using."
        placement={tooltipPlacement}
        align={{ offset: [-10, 5] }}
        getPopupContainer={() => componentRef.current as HTMLElement}
        open={
          // undefined for default behavior of tooltip, hover for show
          // close tooltip when modal is open
          isModalOpen
            ? false
            : showTooltipWhenEmpty
              ? Object.keys(config).length === 0
              : undefined
        }
      >
        {mode === 'icon' ? (
          <SettingOutlined onClick={showModal} />
        ) : (
          <span
            onClick={showModal}
            style={{ color: '#006AFF', cursor: 'pointer' }}
          >
            set up
          </span>
        )}
      </Tooltip>
      <Modal
        title="Model Env Config"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        footer={[
          ...(canRunConnectivityTest
            ? [
                <Button
                  key="save-and-run"
                  type="primary"
                  ghost
                  loading={connectivityLoading}
                  onClick={handleSaveAndRun}
                >
                  Save and Verify Model
                </Button>,
              ]
            : []),
          <Button key="save" type="primary" onClick={handleOk}>
            Save
          </Button>,
        ]}
        style={{ width: '800px', height: '100%', marginTop: '10%' }}
        destroyOnClose={true}
        maskClosable={true}
        centered={true}
      >
        <Input.TextArea
          rows={7}
          placeholder={
            'MIDSCENE_MODEL_API_KEY=sk-...\nMIDSCENE_MODEL_NAME=gpt-4o-2024-08-06\n...'
          }
          value={tempConfigString}
          onChange={(e) => setTempConfigString(e.target.value)}
          style={{ whiteSpace: 'nowrap', wordWrap: 'break-word' }}
        />
        <div>
          <p>The format is KEY=VALUE and separated by new lines.</p>
          <p>
            These data will be saved <strong>locally in your browser</strong>.
          </p>
        </div>
        {connectivityResult ? (
          <Alert
            type={connectivityResult.passed ? 'success' : 'warning'}
            showIcon
            message={
              connectivityResult.passed
                ? 'Model verification passed'
                : 'Model verification failed'
            }
            description={
              <div>
                {connectivityResult.checks.map((item) => (
                  <div key={item.name}>
                    {item.modelName} ({item.intent}):{' '}
                    {item.passed
                      ? 'OK.'
                      : `Failed.${item.message ? ` ${item.message}` : ''}`}
                  </div>
                ))}
              </div>
            }
            style={{ marginTop: 16 }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
