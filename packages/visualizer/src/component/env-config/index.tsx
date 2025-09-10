import { SettingOutlined } from '@ant-design/icons';
import { Input, Modal, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useEnvConfig } from '../../store/store';

export function EnvConfig({
  showTooltipWhenEmpty = true,
  showModelName = true,
  tooltipPlacement = 'bottom',
  mode = 'icon',
}: {
  showTooltipWhenEmpty?: boolean;
  showModelName?: boolean;
  tooltipPlacement?: 'bottom' | 'top';
  mode?: 'icon' | 'text';
}) {
  const { config, configString, loadConfig, syncFromStorage } = useEnvConfig();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempConfigString, setTempConfigString] = useState(configString);
  const midsceneModelName = config.MIDSCENE_MODEL_NAME;
  const componentRef = useRef<HTMLDivElement>(null);
  const showModal = (e: React.MouseEvent) => {
    // every time open modal, sync from localStorage
    syncFromStorage();

    setIsModalOpen(true);
    e.preventDefault();
    e.stopPropagation();
  };

  const handleOk = () => {
    setIsModalOpen(false);
    loadConfig(tempConfigString);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  // when modal is open, use the latest config string
  useEffect(() => {
    if (isModalOpen) {
      setTempConfigString(configString);
    }
  }, [isModalOpen, configString]);

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
        okText="Save"
        style={{ width: '800px', height: '100%', marginTop: '10%' }}
        destroyOnClose={true}
        maskClosable={true}
        centered={true}
      >
        <Input.TextArea
          rows={7}
          placeholder={
            'OPENAI_API_KEY=sk-...\nMIDSCENE_MODEL_NAME=gpt-4o-2024-08-06\n...'
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
      </Modal>
    </div>
  );
}
