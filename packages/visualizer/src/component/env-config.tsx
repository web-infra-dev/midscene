import { SettingOutlined } from '@ant-design/icons';
import { Input, Modal, Tooltip } from 'antd';
import { useState } from 'react';
import { iconForStatus } from './misc';
import { useEnvConfig } from './store/store';

export function EnvConfig() {
  const { config, configString, loadConfig } = useEnvConfig();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempConfigString, setTempConfigString] = useState(configString);
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

  const configTip =
    Object.keys(config).length === 0 ? (
      <div>
        <Tooltip title="No Config">{iconForStatus('failed')}</Tooltip>
      </div>
    ) : (
      <div>
        <Tooltip
          overlayInnerStyle={{
            width: 'fit-content',
          }}
          title={
            <div>
              {Object.entries(config).map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    lineHeight: '1.8',
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '5px',
                  }}
                >
                  <span style={{ color: '#52c41a', marginRight: '8px' }}>
                    {iconForStatus('success')}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {key}: {key === 'MIDSCENE_MODEL_NAME' ? value : '***'}
                  </span>
                </div>
              ))}
            </div>
          }
        >
          {iconForStatus('success')}
        </Tooltip>
      </div>
    );

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        width: '100%',
      }}
    >
      <Tooltip
        title="Please set up your environment variables before using."
        placement="bottom"
        align={{ offset: [-10, 5] }}
        open={Object.keys(config).length === 0}
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
