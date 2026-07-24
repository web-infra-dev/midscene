import { SettingOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { parseConfig, useEnvConfig } from '../../store/store';
import type { PlaygroundSDKLike } from '../../types';
import {
  type CommonAgentOptions,
  ConfigModal,
  type ConfigModalProps,
} from '../config-modal';

export type { CommonAgentOptions } from '../config-modal';

export interface EnvConfigProps {
  showTooltipWhenEmpty?: boolean;
  showModelName?: boolean;
  tooltipPlacement?: 'bottom' | 'top';
  mode?: 'icon' | 'text';
  playgroundSDK?: PlaygroundSDKLike | null;
  onVerify?: ConfigModalProps['onVerify'];
  agentOptions?: CommonAgentOptions;
  onAgentOptionsSave?: (options: CommonAgentOptions) => void | Promise<void>;
}

export function EnvConfig({
  showTooltipWhenEmpty = true,
  showModelName = true,
  tooltipPlacement = 'bottom',
  mode = 'icon',
  playgroundSDK,
  onVerify,
  agentOptions,
  onAgentOptionsSave,
}: EnvConfigProps) {
  const { config, configString, loadConfig, syncFromStorage } = useEnvConfig();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const midsceneModelName = config.MIDSCENE_MODEL_NAME;
  const componentRef = useRef<HTMLDivElement>(null);
  const verifyModel = onVerify ?? playgroundSDK?.runConnectivityTest;

  const showModal = (event: React.MouseEvent) => {
    syncFromStorage();
    setIsModalOpen(true);
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    if (!isModalOpen) return;
    syncFromStorage();
  }, [isModalOpen, syncFromStorage]);

  return (
    <div
      ref={componentRef}
      style={{
        alignItems: 'center',
        display: 'flex',
        gap: '10px',
        height: '100%',
        justifyContent: 'flex-end',
        minHeight: '32px',
      }}
    >
      {showModelName ? midsceneModelName : null}
      <Tooltip
        align={{ offset: [-10, 5] }}
        getPopupContainer={() => componentRef.current as HTMLElement}
        open={
          isModalOpen
            ? false
            : showTooltipWhenEmpty
              ? Object.keys(config).length === 0
              : undefined
        }
        placement={tooltipPlacement}
        title="Please set up your environment variables before using."
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
      <ConfigModal
        agentOptionsValue={agentOptions}
        onClose={() => setIsModalOpen(false)}
        onSave={async ({ text, agentOptions: nextAgentOptions }) => {
          const previousConfigText = configString;
          const previousAgentOptions = agentOptions ?? {};
          let agentOptionsSaved = false;
          let configSaveStarted = false;

          try {
            await onAgentOptionsSave?.(nextAgentOptions);
            agentOptionsSaved = Boolean(onAgentOptionsSave);
            configSaveStarted = true;
            loadConfig(text);
            setIsModalOpen(false);
          } catch (error) {
            const rollbackErrors: unknown[] = [];

            if (configSaveStarted) {
              try {
                loadConfig(previousConfigText);
              } catch (rollbackError) {
                rollbackErrors.push(rollbackError);
              }
            }
            if (agentOptionsSaved) {
              try {
                await onAgentOptionsSave?.(previousAgentOptions);
              } catch (rollbackError) {
                rollbackErrors.push(rollbackError);
              }
            }

            if (rollbackErrors.length > 0) {
              throw new Error(
                `Saving configuration failed and rollback was incomplete. Original error: ${String(error)}. Rollback errors: ${rollbackErrors.map(String).join('; ')}`,
              );
            }
            throw error;
          }
        }}
        onVerify={verifyModel ? (env) => verifyModel(env) : undefined}
        open={isModalOpen}
        parseEnvText={parseConfig}
        showAgentOptions={Boolean(onAgentOptionsSave)}
        textValue={configString}
      />
    </div>
  );
}
