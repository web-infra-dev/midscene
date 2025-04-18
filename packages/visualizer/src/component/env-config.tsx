import { SettingOutlined } from '@ant-design/icons';
import { Input, Modal, Tooltip } from 'antd';
import { useRef, useState } from 'react';
import { useEnvConfig } from './store/store';

export function EnvConfig({
  showTooltipWhenEmpty = true,
  tooltipPlacement = 'bottom',
}: {
  showTooltipWhenEmpty?: boolean;
  tooltipPlacement?: 'bottom' | 'top';
}) {
  const { config, configString, loadConfig } = useEnvConfig();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempConfigString, setTempConfigString] = useState(configString);
  const midsceneModelName = config.MIDSCENE_MODEL_NAME;
  const componentRef = useRef<HTMLDivElement>(null);
  const showModal = (e: React.MouseEvent) => {
    setIsModalOpen(true);
    e.preventDefault();
  };

  const handleOk = () => {
    setIsModalOpen(false);
    loadConfig(tempConfigString);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        minHeight: '32px',
      }}
      ref={componentRef}
    >
      {midsceneModelName}
      <Tooltip
        title="Please set up your environment variables before using."
        placement={tooltipPlacement}
        align={{ offset: [-10, 5] }}
        open={
          // undefined for default behavior of tooltip, hover for show
          showTooltipWhenEmpty ? Object.keys(config).length === 0 : undefined
        }
        getPopupContainer={() => componentRef.current!}
      >
        <SettingOutlined onClick={showModal} />
      </Tooltip>
      <Modal
        title="Model Env Config"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Save"
        style={{ width: '800px' }}
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
