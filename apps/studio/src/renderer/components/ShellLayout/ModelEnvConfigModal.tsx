import { useEffect, useMemo, useRef, useState } from 'react';
import type { StudioAgentOptions } from '../../../shared/agent-options';
import { MaskedIcon } from '../MaskedIcon';
import {
  AgentOptionConfigForm,
  type AgentOptionFormValues,
  agentOptionsToFormValues,
  parseAgentOptionFormValues,
} from './AgentOptionConfigForm';
import { ModelEnvConfigFormFields } from './ModelEnvConfigFormFields';
import { ModelEnvConfigStatus } from './ModelEnvConfigStatus';
import {
  parseEnvText,
  resolveModelConnection,
  setEnvFieldValue,
} from './connectivity-env';

type TabKey = 'text' | 'form';

type TestStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success' }
  | { kind: 'error'; message?: string };

export interface ModelEnvConfigModalProps {
  open: boolean;
  initialTab?: TabKey;
  textValue?: string;
  agentOptionsValue?: StudioAgentOptions;
  onClose: () => void;
  onSave?: (payload: {
    text: string;
    agentOptions: StudioAgentOptions;
  }) => void | Promise<void>;
}

const TEXT_PLACEHOLDER =
  'MIDSCENE_MODEL_BASE_URL=...\nMIDSCENE_MODEL_API_KEY=...\nMIDSCENE_MODEL_NAME=...\nMIDSCENE_MODEL_FAMILY=...';
const closeIconSrc = new URL('./model-env-close.svg', import.meta.url).href;
const connectivityIconSrc = new URL(
  './model-env-connectivity.svg',
  import.meta.url,
).href;
const SAVE_AFTER_SUCCESS_DELAY_MS = 1800;

function ConnectivityPlayIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-text-primary"
      fill="none"
      viewBox="0 0 16 16"
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

function ConfigModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative z-10 box-border flex w-full items-center justify-between px-[20px] pt-[20.8px]">
      <h2 className="m-0 font-sans text-[16px] font-semibold leading-[24px] tracking-normal text-text-primary">
        Config
      </h2>
      <button
        aria-label="Close"
        className="flex h-[16px] w-[16px] cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-text-secondary transition-colors hover:text-text-primary"
        onClick={onClose}
        type="button"
      >
        <MaskedIcon className="h-[16px] w-[16px]" src={closeIconSrc} />
      </button>
    </div>
  );
}

function EnvStyleSelect({
  tab,
  onTabChange,
}: {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <div className="relative z-10 h-[32px] w-[132px]">
      <select
        aria-label="Model env config style"
        className="h-full w-full cursor-pointer appearance-none rounded-[8px] border border-border-control bg-surface-elevated px-[12px] pr-[32px] font-sans text-[14px] font-medium leading-[16.9px] text-text-primary outline-none hover:bg-surface-hover focus:border-brand"
        onChange={(event) => onTabChange(event.target.value as TabKey)}
        value={tab}
      >
        <option value="text">.env Style</option>
        <option value="form">Form Style</option>
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-[10px] top-1/2 h-[12px] w-[12px] -translate-y-1/2 text-text-secondary"
        fill="none"
        viewBox="0 0 12 12"
      >
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
}

function ConnectivityButton({
  onConnectivityTest,
  canRunConnectivityTest,
  isSaving,
  testStatus,
}: {
  onConnectivityTest: () => void;
  canRunConnectivityTest: boolean;
  isSaving: boolean;
  testStatus: TestStatus;
}) {
  const isTesting = testStatus.kind === 'running';
  const connectivityLabel = isTesting ? 'Testing...' : 'Verify and Save Model';

  return (
    <button
      className={`flex h-[32px] w-auto min-w-[190px] items-center justify-center gap-[6px] rounded-[8px] border border-border-control bg-surface-elevated px-[16px] py-0 ${
        isTesting
          ? 'cursor-not-allowed opacity-60'
          : canRunConnectivityTest
            ? 'cursor-pointer hover:bg-surface-hover'
            : 'cursor-not-allowed'
      }`}
      disabled={!canRunConnectivityTest || isTesting || isSaving}
      onClick={onConnectivityTest}
      type="button"
    >
      {isTesting ? (
        <img
          alt=""
          className="h-4 w-4 animate-spin"
          src={connectivityIconSrc}
        />
      ) : (
        <ConnectivityPlayIcon />
      )}
      <span className="whitespace-nowrap font-sans text-[14px] font-medium text-text-primary leading-[16px]">
        {connectivityLabel}
      </span>
    </button>
  );
}

function EnvModalFooter({
  onSave,
  canSave,
  isSaving,
}: {
  onSave: () => void;
  canSave: boolean;
  isSaving: boolean;
}) {
  return (
    <div className="relative z-10 mt-auto box-border flex w-full items-center justify-end px-[20px] pb-[24px]">
      <button
        className={`flex h-[32px] w-[76px] items-center justify-center rounded-[8px] border border-brand bg-brand p-0 hover:opacity-90 ${
          canSave ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
        }`}
        disabled={!canSave}
        aria-busy={isSaving}
        onClick={onSave}
        type="button"
      >
        <span className="w-[33px] overflow-hidden whitespace-nowrap text-center font-sans text-[14px] font-medium leading-[16px] text-white">
          Save
        </span>
      </button>
    </div>
  );
}

export function ModelEnvConfigModal({
  open,
  initialTab = 'text',
  textValue: initialTextValue,
  agentOptionsValue: initialAgentOptionsValue,
  onClose,
  onSave,
}: ModelEnvConfigModalProps) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [text, setText] = useState(initialTextValue ?? '');
  const [agentOptionValues, setAgentOptionValues] =
    useState<AgentOptionFormValues>(() =>
      agentOptionsToFormValues(initialAgentOptionsValue ?? {}),
    );
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const testRunIdRef = useRef(0);
  const pendingSaveTimerRef = useRef<number | null>(null);

  const clearPendingSaveTimer = () => {
    if (pendingSaveTimerRef.current === null) {
      return;
    }
    window.clearTimeout(pendingSaveTimerRef.current);
    pendingSaveTimerRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      clearPendingSaveTimer();
      return;
    }

    clearPendingSaveTimer();
    testRunIdRef.current += 1;
    setTab(initialTab);
    setText(initialTextValue ?? '');
    setAgentOptionValues(
      agentOptionsToFormValues(initialAgentOptionsValue ?? {}),
    );
    setTestStatus({ kind: 'idle' });
    setIsSaving(false);
    setSaveError(null);
  }, [initialAgentOptionsValue, initialTab, initialTextValue, open]);

  useEffect(() => () => clearPendingSaveTimer(), []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const envValues = useMemo(() => parseEnvText(text), [text]);
  const parsedAgentOptions = useMemo(
    () => parseAgentOptionFormValues(agentOptionValues),
    [agentOptionValues],
  );
  const resolvedConnection = useMemo(
    () => resolveModelConnection(envValues),
    [envValues],
  );
  const validationError =
    'error' in resolvedConnection &&
    resolvedConnection.kind === 'invalid-config'
      ? resolvedConnection.error
      : null;
  const canRunConnectivityTest = !('error' in resolvedConnection);
  const hasTestStatus =
    testStatus.kind === 'success' || testStatus.kind === 'error';
  const statusKind = validationError
    ? 'error'
    : hasTestStatus
      ? testStatus.kind
      : null;
  const statusMessage =
    validationError ??
    (testStatus.kind === 'error' ? testStatus.message : undefined);
  if (!open) {
    return null;
  }

  const handleTextChange = (nextText: string) => {
    clearPendingSaveTimer();
    testRunIdRef.current += 1;
    setText(nextText);
    setSaveError(null);
    setTestStatus((currentStatus) =>
      currentStatus.kind === 'idle' ? currentStatus : { kind: 'idle' },
    );
  };

  const handleFieldChange = (key: string, value: string) => {
    handleTextChange(setEnvFieldValue(text, key, value));
  };

  const handleAgentOptionChange = (
    key: keyof AgentOptionFormValues,
    value: string,
  ) => {
    clearPendingSaveTimer();
    testRunIdRef.current += 1;
    setAgentOptionValues((current) => ({ ...current, [key]: value }));
    setSaveError(null);
    setTestStatus((currentStatus) =>
      currentStatus.kind === 'idle' ? currentStatus : { kind: 'idle' },
    );
  };

  const saveConfig = async (agentOptions: StudioAgentOptions) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave?.({ text, agentOptions });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectivityTest = async () => {
    if (
      testStatus.kind === 'running' ||
      'error' in resolvedConnection ||
      !parsedAgentOptions.options
    ) {
      return;
    }

    if (!window.studioRuntime) {
      setTestStatus({
        kind: 'error',
        message: 'Studio runtime is not available.',
      });
      return;
    }

    const testRunId = testRunIdRef.current + 1;
    testRunIdRef.current = testRunId;
    setTestStatus({ kind: 'running' });
    try {
      const result = await window.studioRuntime.runConnectivityTest(envValues);
      if (testRunIdRef.current !== testRunId) {
        return;
      }
      if (result.passed) {
        setTestStatus({ kind: 'success' });
        clearPendingSaveTimer();
        pendingSaveTimerRef.current = window.setTimeout(() => {
          if (testRunIdRef.current === testRunId) {
            void saveConfig(parsedAgentOptions.options);
          }
          pendingSaveTimerRef.current = null;
        }, SAVE_AFTER_SUCCESS_DELAY_MS);
        return;
      }
      setTestStatus({
        kind: 'error',
        message: result.message || 'Connectivity test failed without details.',
      });
    } catch (error) {
      if (testRunIdRef.current !== testRunId) {
        return;
      }
      setTestStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleSave = () => {
    if (!parsedAgentOptions.options || isSaving) {
      return;
    }
    clearPendingSaveTimer();
    testRunIdRef.current += 1;
    void saveConfig(parsedAgentOptions.options);
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35 font-sans"
      onClick={onClose}
      // biome-ignore lint/a11y/useSemanticElements: overlay wrapper styled as backdrop; card below carries the dialog semantics
      role="dialog"
    >
      <div
        className="relative box-border flex max-h-[90vh] min-h-[600px] w-[500px] flex-col overflow-y-auto rounded-[16px] bg-surface-elevated shadow-[0px_4px_20px_rgba(0,0,0,0.05)]"
        onClick={(event) => event.stopPropagation()}
      >
        <ConfigModalHeader onClose={onClose} />
        <h3 className="m-0 mt-[20px] px-[21px] font-sans text-[14px] font-semibold leading-[20px] text-text-primary">
          Model Env Config
        </h3>
        <div className="mt-[12px] px-[21px]">
          <EnvStyleSelect onTabChange={setTab} tab={tab} />
        </div>

        {tab === 'text' ? (
          <div className="relative z-10 mx-[21px] mt-[16px]">
            <textarea
              className="box-border h-[162px] w-full resize-none overflow-hidden rounded-[12px] border border-border-control bg-surface-elevated p-[12px] font-sans text-[14px] font-normal leading-[16.9px] text-text-primary outline-none placeholder:text-text-placeholder"
              onChange={(event) => handleTextChange(event.target.value)}
              placeholder={TEXT_PLACEHOLDER}
              value={text}
              wrap="off"
            />
          </div>
        ) : (
          <ModelEnvConfigFormFields
            onFieldChange={handleFieldChange}
            values={envValues}
          />
        )}

        {tab === 'text' ? (
          <div className="relative z-10 mt-[16px] px-[21px]">
            <p className="m-0 font-sans text-[12px] font-normal leading-[14.5px] text-text-secondary">
              The format is KEY=VALUE and separated by new lines. These data
              will be saved{' '}
              <span className="font-bold text-text-primary">
                locally in your browser
              </span>
              .
            </p>
          </div>
        ) : null}

        <div className="relative z-10 mt-[12px] flex items-start justify-end gap-[12px] px-[21px]">
          {statusKind ? (
            <ModelEnvConfigStatus kind={statusKind} message={statusMessage} />
          ) : null}
          <ConnectivityButton
            canRunConnectivityTest={
              canRunConnectivityTest &&
              Boolean(parsedAgentOptions.options) &&
              !isSaving
            }
            isSaving={isSaving}
            onConnectivityTest={handleConnectivityTest}
            testStatus={testStatus}
          />
        </div>

        <div className="mx-[21px] my-[16px] h-px shrink-0 bg-border-control" />
        <AgentOptionConfigForm
          error={parsedAgentOptions.error ?? saveError}
          onChange={handleAgentOptionChange}
          values={agentOptionValues}
        />

        <EnvModalFooter
          canSave={Boolean(parsedAgentOptions.options) && !isSaving}
          isSaving={isSaving}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
