import { useEffect, useMemo, useRef, useState } from 'react';
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
  | { kind: 'error' };

export interface ModelEnvConfigModalProps {
  open: boolean;
  initialTab?: TabKey;
  textValue?: string;
  onClose: () => void;
  onSave?: (payload: { text: string }) => void;
}

const TEXT_PLACEHOLDER =
  'MIDSCENE_MODEL_BASE_URL=...\nMIDSCENE_MODEL_API_KEY=...\nMIDSCENE_MODEL_NAME=...\nMIDSCENE_MODEL_FAMILY=...';
const closeIconSrc = new URL('./model-env-close.svg', import.meta.url).href;
const connectivityIconSrc = new URL(
  './model-env-connectivity.svg',
  import.meta.url,
).href;

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

function EnvModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative z-10 box-border flex w-full items-center justify-between px-[20px] pt-[20.8px]">
      <h2 className="m-0 font-['Inter'] text-[16px] font-semibold leading-[24px] tracking-normal text-text-primary">
        Model Env Config
      </h2>
      <button
        aria-label="Close"
        className="flex h-[16px] w-[16px] cursor-pointer items-center justify-center border-0 bg-transparent p-0"
        onClick={onClose}
        type="button"
      >
        <img
          alt=""
          aria-hidden="true"
          className="h-[16px] w-[16px]"
          src={closeIconSrc}
        />
      </button>
    </div>
  );
}

function EnvModalTabs({
  tab,
  onTabChange,
}: {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <div className="relative z-10 box-border flex h-[36px] w-[146px] items-center rounded-[32px] bg-surface-muted p-[2px]">
      {/*
        Active tab fills with `bg-surface-elevated` for the white pill on
        light mode. In dark mode `surface-elevated` and `surface-muted`
        collapse to the same `#2b2b2b`, so the pill disappears — fall
        back to the translucent `bg-surface-active` overlay only in dark.
      */}
      <button
        className={`flex h-[32px] w-[70px] cursor-pointer items-center justify-center border-0 p-0 font-['Inter'] text-[14px] leading-[16.9px] transition-colors duration-200 ${
          tab === 'text'
            ? 'rounded-[30px] bg-surface-elevated font-medium text-text-primary dark:bg-surface-active'
            : 'rounded-[10px] bg-transparent font-normal text-text-secondary'
        }`}
        onClick={() => onTabChange('text')}
        type="button"
      >
        Text
      </button>
      <button
        className={`flex h-[32px] w-[70px] cursor-pointer items-center justify-center border-0 p-0 font-['Inter'] text-[14px] leading-[16.9px] transition-colors duration-200 ${
          tab === 'form'
            ? 'rounded-[30px] bg-surface-elevated font-medium text-text-primary dark:bg-surface-active'
            : 'rounded-[10px] bg-transparent font-normal text-text-secondary'
        }`}
        onClick={() => onTabChange('form')}
        type="button"
      >
        Form
      </button>
    </div>
  );
}

function EnvModalFooter({
  onCancel,
  onConnectivityTest,
  onSave,
  canRunConnectivityTest,
  testStatus,
}: {
  onCancel: () => void;
  onConnectivityTest: () => void;
  onSave: () => void;
  canRunConnectivityTest: boolean;
  testStatus: TestStatus;
}) {
  const isTesting = testStatus.kind === 'running';
  const connectivityLabel = isTesting ? 'Testing...' : 'Connectivity test';

  return (
    <div className="relative z-10 mt-auto box-border flex w-full items-center justify-between px-[20px] pb-[24px]">
      <button
        className={`flex h-[32px] w-[159px] items-center gap-[4px] rounded-[8px] border border-border-subtle bg-surface-elevated px-[12px] py-0 ${
          isTesting
            ? 'cursor-not-allowed opacity-60'
            : canRunConnectivityTest
              ? 'cursor-pointer hover:bg-surface-hover'
              : 'cursor-not-allowed'
        }`}
        disabled={!canRunConnectivityTest || isTesting}
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
        <span className="w-[115px] overflow-hidden whitespace-nowrap text-left font-['Inter'] text-[14px] font-medium text-text-primary leading-[16px]">
          {connectivityLabel}
        </span>
      </button>

      <div className="flex items-center gap-[8px]">
        <button
          className="flex h-[32px] w-[76px] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-surface-muted p-0 hover:bg-surface-hover-strong"
          onClick={onCancel}
          type="button"
        >
          <span className="w-[47px] overflow-hidden whitespace-nowrap text-center font-['Inter'] text-[14px] font-medium leading-[16px] text-text-secondary">
            Cancel
          </span>
        </button>
        <button
          className="flex h-[32px] w-[76px] cursor-pointer items-center justify-center rounded-[8px] border border-brand bg-brand p-0 hover:opacity-90"
          onClick={onSave}
          type="button"
        >
          <span className="w-[33px] overflow-hidden whitespace-nowrap text-center font-['Inter'] text-[14px] font-medium leading-[16px] text-white">
            Save
          </span>
        </button>
      </div>
    </div>
  );
}

export function ModelEnvConfigModal({
  open,
  initialTab = 'text',
  textValue: initialTextValue,
  onClose,
  onSave,
}: ModelEnvConfigModalProps) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [text, setText] = useState(initialTextValue ?? '');
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' });
  const testRunIdRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    testRunIdRef.current += 1;
    setTab(initialTab);
    setText(initialTextValue ?? '');
    setTestStatus({ kind: 'idle' });
  }, [initialTab, initialTextValue, open]);

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
  const resolvedConnection = useMemo(
    () => resolveModelConnection(envValues),
    [envValues],
  );
  const canRunConnectivityTest = !('error' in resolvedConnection);
  const isExpandedForm = tab === 'form';
  const hasTestStatus =
    testStatus.kind === 'success' || testStatus.kind === 'error';
  const modalHeightClass =
    isExpandedForm && hasTestStatus
      ? 'h-[603px]'
      : isExpandedForm
        ? 'h-[563px]'
        : hasTestStatus
          ? 'h-[444px]'
          : 'h-[404px]';
  const modalVerticalOffsetClass =
    isExpandedForm && hasTestStatus
      ? 'translate-y-[99.5px]'
      : isExpandedForm
        ? 'translate-y-[79.5px]'
        : hasTestStatus
          ? 'translate-y-[20px]'
          : '';
  const descriptionMarginClass = isExpandedForm
    ? 'mt-[20px]'
    : hasTestStatus
      ? 'mt-[12px]'
      : 'mt-[16px]';

  if (!open) {
    return null;
  }

  const handleTextChange = (nextText: string) => {
    testRunIdRef.current += 1;
    setText(nextText);
    setTestStatus((currentStatus) =>
      currentStatus.kind === 'idle' ? currentStatus : { kind: 'idle' },
    );
  };

  const handleFieldChange = (key: string, value: string) => {
    handleTextChange(setEnvFieldValue(text, key, value));
  };

  const handleConnectivityTest = async () => {
    if (testStatus.kind === 'running' || 'error' in resolvedConnection) {
      return;
    }

    if (!window.studioRuntime) {
      setTestStatus({ kind: 'error' });
      return;
    }

    const testRunId = testRunIdRef.current + 1;
    testRunIdRef.current = testRunId;
    setTestStatus({ kind: 'running' });
    try {
      const result =
        await window.studioRuntime.runConnectivityTest(resolvedConnection);
      if (testRunIdRef.current !== testRunId) {
        return;
      }
      setTestStatus({ kind: result.ok ? 'success' : 'error' });
    } catch {
      if (testRunIdRef.current !== testRunId) {
        return;
      }
      setTestStatus({ kind: 'error' });
    }
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35"
      onClick={onClose}
      // biome-ignore lint/a11y/useSemanticElements: overlay wrapper styled as backdrop; card below carries the dialog semantics
      role="dialog"
    >
      <div
        className={`relative box-border flex ${modalHeightClass} w-[400px] ${modalVerticalOffsetClass} flex-col overflow-hidden rounded-[16px] bg-surface-elevated shadow-[0px_4px_20px_rgba(0,0,0,0.05)]`}
        onClick={(event) => event.stopPropagation()}
      >
        <EnvModalHeader onClose={onClose} />
        <div className="mt-[19.2px] px-[21px]">
          <EnvModalTabs onTabChange={setTab} tab={tab} />
        </div>

        {tab === 'text' ? (
          <div className="relative z-10 mt-[16px] flex w-full justify-center">
            <textarea
              className="box-border h-[162px] w-[360px] resize-none overflow-hidden rounded-[12px] border border-border-subtle bg-surface-elevated p-[12px] font-['Inter'] text-[14px] font-normal leading-[16.9px] text-text-primary placeholder:text-text-placeholder outline-none"
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

        <div className={`relative z-10 ${descriptionMarginClass} px-[21px]`}>
          <p className="m-0 font-['Inter'] text-[12px] font-normal leading-[14.5px] text-text-secondary">
            The format is KEY=VALUE and separated by new lines. These data will
            be saved{' '}
            <span className="font-bold text-text-primary">
              locally in your browser
            </span>
            .
          </p>
        </div>

        {hasTestStatus ? <ModelEnvConfigStatus kind={testStatus.kind} /> : null}

        <EnvModalFooter
          canRunConnectivityTest={canRunConnectivityTest}
          onCancel={onClose}
          onConnectivityTest={handleConnectivityTest}
          onSave={() => onSave?.({ text })}
          testStatus={testStatus}
        />
      </div>
    </div>
  );
}
