import type { AgentOpt, ConnectivityTestResult } from '@midscene/core';
import {
  Alert,
  Button,
  Divider,
  Flex,
  Input,
  Modal,
  Select,
  Typography,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import './index.less';

const { TextArea } = Input;

export const COMMON_AGENT_OPTION_KEYS = [
  'replanningCycleLimit',
  'waitAfterAction',
  'screenshotShrinkFactor',
] as const;

export type CommonAgentOptionKey = (typeof COMMON_AGENT_OPTION_KEYS)[number];
export type CommonAgentOptions = Partial<Pick<AgentOpt, CommonAgentOptionKey>>;
export type CommonAgentOptionFormValues = Record<CommonAgentOptionKey, string>;
export type ConfigModalTab = 'text' | 'form';

export interface ConfigModalEnvField {
  key: string;
  placeholder: string;
}

export interface ConfigModalProps {
  open: boolean;
  textValue?: string;
  agentOptionsValue?: CommonAgentOptions;
  initialTab?: ConfigModalTab;
  showEnvStyleSelect?: boolean;
  showAgentOptions?: boolean;
  envFields?: readonly ConfigModalEnvField[];
  parseEnvText?: (text: string) => Record<string, string>;
  setEnvFieldValue?: (text: string, key: string, value: string) => string;
  validateEnvText?: (text: string) => string | null;
  onClose: () => void;
  onSave: (payload: {
    text: string;
    agentOptions: CommonAgentOptions;
  }) => void | Promise<void>;
  onVerify?: (env: Record<string, string>) => Promise<ConnectivityTestResult>;
}

const EMPTY_AGENT_OPTIONS: CommonAgentOptions = {};
const SUCCESS_FEEDBACK_DURATION_MS = 1800;
const TEXT_PLACEHOLDER =
  'MIDSCENE_MODEL_BASE_URL=...\nMIDSCENE_MODEL_API_KEY=...\nMIDSCENE_MODEL_NAME=...\nMIDSCENE_MODEL_FAMILY=...';

const DEFAULT_ENV_FIELDS: readonly ConfigModalEnvField[] = [
  {
    key: 'MIDSCENE_MODEL_BASE_URL',
    placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  { key: 'MIDSCENE_MODEL_API_KEY', placeholder: 'sk-...' },
  { key: 'MIDSCENE_MODEL_NAME', placeholder: 'qwen3-vl-plus' },
  { key: 'MIDSCENE_MODEL_FAMILY', placeholder: 'qwen3-vl' },
];

const OPTION_FIELDS: Array<{
  key: CommonAgentOptionKey;
  label: string;
  placeholder: string;
}> = [
  {
    key: 'replanningCycleLimit',
    label: 'Replanning Cycle Limit',
    placeholder: 'Model default',
  },
  {
    key: 'waitAfterAction',
    label: 'Wait After Action (ms)',
    placeholder: 'Default: 300',
  },
  {
    key: 'screenshotShrinkFactor',
    label: 'Screenshot Shrink Factor',
    placeholder: 'Default: 1',
  },
];

export function agentOptionsToFormValues(
  options: CommonAgentOptions,
): CommonAgentOptionFormValues {
  return {
    replanningCycleLimit: options.replanningCycleLimit?.toString() ?? '',
    waitAfterAction: options.waitAfterAction?.toString() ?? '',
    screenshotShrinkFactor: options.screenshotShrinkFactor?.toString() ?? '',
  };
}

export function parseAgentOptionFormValues(
  values: CommonAgentOptionFormValues,
):
  | { options: CommonAgentOptions; error: null }
  | { options: null; error: string } {
  const options: CommonAgentOptions = {};
  const replanningCycleLimit = values.replanningCycleLimit.trim();
  const waitAfterAction = values.waitAfterAction.trim();
  const screenshotShrinkFactor = values.screenshotShrinkFactor.trim();

  if (replanningCycleLimit) {
    const value = Number(replanningCycleLimit);
    if (!Number.isInteger(value) || value < 0) {
      return {
        options: null,
        error:
          'Replanning cycle limit must be an integer greater than or equal to 0.',
      };
    }
    options.replanningCycleLimit = value;
  }

  if (waitAfterAction) {
    const value = Number(waitAfterAction);
    if (!Number.isFinite(value) || value < 0) {
      return {
        options: null,
        error: 'Wait after action must be a number greater than or equal to 0.',
      };
    }
    options.waitAfterAction = value;
  }

  if (screenshotShrinkFactor) {
    const value = Number(screenshotShrinkFactor);
    if (!Number.isFinite(value) || value < 1) {
      return {
        options: null,
        error:
          'Screenshot shrink factor must be a number greater than or equal to 1.',
      };
    }
    options.screenshotShrinkFactor = value;
  }

  return { options, error: null };
}

function defaultParseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (key) env[key] = value.replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function defaultSetEnvFieldValue(text: string, key: string, value: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
  if (!value) {
    if (index >= 0) lines.splice(index, 1);
  } else if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }
  return lines.join('\n');
}

function VerifyPlayIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M5 8.00002V3.95856L8.5 5.97929L12 8.00002L8.5 10.0208L5 12.0415V8.00002Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
    </svg>
  );
}

function VerifyButtonIcon({ isLoading }: { isLoading: boolean }) {
  return (
    <span className="midscene-config-modal-verify-icon">
      {isLoading ? (
        <svg
          aria-hidden="true"
          className="midscene-config-modal-spinner"
          fill="none"
          height="16"
          viewBox="0 0 16 16"
          width="16"
        >
          <path
            d="M8 1.5A6.5 6.5 0 1 0 14.5 8"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      ) : (
        <VerifyPlayIcon />
      )}
    </span>
  );
}

export function ConfigModal({
  open,
  textValue = '',
  agentOptionsValue = EMPTY_AGENT_OPTIONS,
  initialTab = 'text',
  showEnvStyleSelect = false,
  showAgentOptions = true,
  envFields = DEFAULT_ENV_FIELDS,
  parseEnvText = defaultParseEnvText,
  setEnvFieldValue = defaultSetEnvFieldValue,
  validateEnvText,
  onClose,
  onSave,
  onVerify,
}: ConfigModalProps) {
  const [tab, setTab] = useState<ConfigModalTab>(initialTab);
  const [text, setText] = useState(textValue);
  const [agentOptionValues, setAgentOptionValues] =
    useState<CommonAgentOptionFormValues>(() =>
      agentOptionsToFormValues(agentOptionsValue),
    );
  const [testStatus, setTestStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'success' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const testRunIdRef = useRef(0);
  const successDismissTimerRef = useRef<number | null>(null);

  const clearSuccessDismissTimer = () => {
    if (successDismissTimerRef.current === null) return;
    window.clearTimeout(successDismissTimerRef.current);
    successDismissTimerRef.current = null;
  };

  useEffect(() => {
    clearSuccessDismissTimer();
    if (!open) return;
    testRunIdRef.current += 1;
    setTab(initialTab);
    setText(textValue);
    setAgentOptionValues(agentOptionsToFormValues(agentOptionsValue));
    setTestStatus({ kind: 'idle' });
    setSaveError(null);
  }, [agentOptionsValue, initialTab, open, textValue]);

  useEffect(
    () => () => {
      clearSuccessDismissTimer();
    },
    [],
  );

  const envValues = useMemo(() => parseEnvText(text), [parseEnvText, text]);
  const parsedAgentOptions = useMemo(
    () => parseAgentOptionFormValues(agentOptionValues),
    [agentOptionValues],
  );
  const envError = validateEnvText?.(text) ?? null;
  const statusError =
    envError ?? (testStatus.kind === 'error' ? testStatus.message : null);

  const resetFeedback = () => {
    clearSuccessDismissTimer();
    testRunIdRef.current += 1;
    setTestStatus((current) =>
      current.kind === 'idle' ? current : { kind: 'idle' },
    );
    setSaveError(null);
  };

  const handleVerify = async () => {
    if (!onVerify || envError || testStatus.kind === 'running') return;

    const testRunId = testRunIdRef.current + 1;
    testRunIdRef.current = testRunId;
    clearSuccessDismissTimer();
    setTestStatus({ kind: 'running' });
    try {
      const result = await onVerify(envValues);
      if (testRunIdRef.current !== testRunId) return;
      if (result.passed) {
        setTestStatus({ kind: 'success' });
        successDismissTimerRef.current = window.setTimeout(() => {
          if (testRunIdRef.current === testRunId) {
            setTestStatus({ kind: 'idle' });
          }
          successDismissTimerRef.current = null;
        }, SUCCESS_FEEDBACK_DURATION_MS);
        return;
      }
      setTestStatus({
        kind: 'error',
        message: result.message || 'Connectivity test failed without details.',
      });
    } catch (error) {
      if (testRunIdRef.current !== testRunId) return;
      setTestStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleSave = async () => {
    if (!parsedAgentOptions.options || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave({ text, agentOptions: parsedAgentOptions.options });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      centered
      className="midscene-config-modal"
      destroyOnClose
      footer={
        <Button
          disabled={!parsedAgentOptions.options}
          loading={isSaving}
          onClick={() => void handleSave()}
          type="primary"
        >
          Save
        </Button>
      }
      maskClosable
      onCancel={onClose}
      open={open}
      title="Config"
      width={500}
    >
      <Flex gap={12} vertical>
        <section>
          <Flex gap={12} vertical>
            <Typography.Text strong>Model Env Config</Typography.Text>
            {showEnvStyleSelect ? (
              <div>
                <Select
                  aria-label="Model env config style"
                  onChange={(value) => {
                    resetFeedback();
                    setTab(value);
                  }}
                  options={[
                    { label: '.env Style', value: 'text' },
                    { label: 'Form Style', value: 'form' },
                  ]}
                  popupClassName="midscene-config-modal-select-dropdown"
                  value={tab}
                />
              </div>
            ) : null}
          </Flex>
        </section>

        {tab === 'form' && showEnvStyleSelect ? (
          <Flex gap={12} vertical>
            {envFields.map((field) => (
              <Flex gap="small" key={field.key} vertical>
                <label htmlFor={`config-modal-${field.key}`}>
                  <Typography.Text>{field.key}</Typography.Text>
                </label>
                <Input
                  aria-label={`${field.key} value`}
                  id={`config-modal-${field.key}`}
                  onChange={(event) => {
                    resetFeedback();
                    setText(
                      setEnvFieldValue(text, field.key, event.target.value),
                    );
                  }}
                  placeholder={field.placeholder}
                  value={envValues[field.key] ?? ''}
                />
              </Flex>
            ))}
          </Flex>
        ) : (
          <>
            <TextArea
              aria-label="Model environment configuration"
              onChange={(event) => {
                resetFeedback();
                setText(event.target.value);
              }}
              placeholder={TEXT_PLACEHOLDER}
              rows={7}
              value={text}
              wrap="off"
            />
            <Typography.Text type="secondary">
              The format is KEY=VALUE and separated by new lines. These data
              will be saved{' '}
              <Typography.Text strong>locally in your browser</Typography.Text>.
            </Typography.Text>
          </>
        )}

        {envError ? <Alert message={envError} showIcon type="error" /> : null}

        <Flex align="center" gap="small" justify="space-between">
          {testStatus.kind === 'success' ? (
            <Alert
              message="Test passed."
              showIcon
              style={{ height: 32, paddingBlock: 4 }}
              type="success"
            />
          ) : statusError ? (
            <Alert message={statusError} showIcon type="error" />
          ) : (
            <span />
          )}
          {onVerify ? (
            <Button
              className="midscene-config-modal-verify-button"
              disabled={Boolean(envError) || testStatus.kind === 'running'}
              icon={
                <VerifyButtonIcon isLoading={testStatus.kind === 'running'} />
              }
              onClick={() => void handleVerify()}
            >
              Verify Model
            </Button>
          ) : null}
        </Flex>

        {showAgentOptions ? (
          <>
            <Divider style={{ marginBlock: 4 }} />
            <section>
              <Typography.Text strong>Agent Option Config</Typography.Text>
              <Flex gap={12} vertical>
                {OPTION_FIELDS.map((field) => (
                  <Flex
                    align="center"
                    gap="middle"
                    justify="space-between"
                    key={field.key}
                  >
                    <Flex flex="1 1 auto">
                      <Typography.Text type="secondary">
                        {field.label}
                      </Typography.Text>
                    </Flex>
                    <Flex flex="0 0 180px">
                      <Input
                        aria-label={field.label}
                        min={field.key === 'screenshotShrinkFactor' ? 1 : 0}
                        onChange={(event) => {
                          resetFeedback();
                          setAgentOptionValues((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }));
                        }}
                        placeholder={field.placeholder}
                        type="number"
                        value={agentOptionValues[field.key]}
                      />
                    </Flex>
                  </Flex>
                ))}
              </Flex>
              <Typography.Text type="secondary">
                Leave a field empty to use the default value. Changes apply on
                the next Agent connection.
              </Typography.Text>
              {(parsedAgentOptions.error ?? saveError) ? (
                <Alert
                  message={parsedAgentOptions.error ?? saveError}
                  showIcon
                  type="error"
                />
              ) : null}
            </section>
          </>
        ) : null}
      </Flex>
    </Modal>
  );
}
